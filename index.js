const { Builder, By, until } = require('selenium-webdriver')
const chrome = require('selenium-webdriver/chrome');
const cron = require('node-cron')
const path = require('path')
const nodemailer = require('nodemailer')
const bunyan = require('bunyan')

// Get config

require('dotenv').config({ path: path.resolve(__dirname, '.env') })

const bunyanOpts = {
  name: 'Frisko Reservation',
  streams: [
    {
      level: 'debug',
      stream: process.stdout // log INFO and above to stdout
    },
    {
      level: 'info',
      path: path.resolve(__dirname, 'log.json') // log ERROR and above to a file
    }
  ]
}

// App logging
const logger = bunyan.createLogger(bunyanOpts)

// create reusable transporter object using the default SMTP transport
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: Number(process.env.EMAIL_PORT),
  secure: process.env.EMAIL_PORT === '465',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
})

// send mail with defined transport object
const sendEmail = async (dateText) => {
  return await transporter.sendMail({
    from: `"Frisco app 👻" <${process.env.EMAIL_USER}>`,
    to: process.env.EMAIL_TO,
    subject: 'Reservation Made ✔',
    html: `<p><b>Frisco App</b></p><p>Reservation date: ${dateText}`
  })
}

const delay = (t, val) => {
  return new Promise(function (resolve) {
    setTimeout(function () {
      resolve(val)
    }, t)
  })
}

const isMonthPresent = (text, month) => {
  if (text.search(month) > 0) {
    return true
  } else {
    return false
  }
}

// set up the cron selenium job
const task = cron.schedule(`*/${process.env.CRON} * * * *`, () => {
  runSelenium()
})

//Headless chrome screen settings

const screen = {
    width: 1920,
    height: 1440
  };

// Actual selenium job
const runSelenium = async () => {
  logger.info(`Cron started ${new Date()}`)

  // use chrome driver
  const driver = await new Builder().forBrowser('chrome').setChromeOptions(new chrome.Options().windowSize(screen)).build()
  try {

    // Go to frisco website
    await driver.get('https://frisco.pl')

    //Find the login button and click
    await driver.findElement(By.xpath("//*[@id='header']/div/div[1]/div/div[3]/div/a[1]")).click()
    
    //Wait for the login popup to shop up and input the login
    await driver.wait(until.elementLocated(By.xpath('/ html / body / div[1] / div / div[2] / div / div[2] / div / form / div / div[1] / div / input')), 1000).sendKeys(process.env.EMAIL)
    await driver.wait(until.elementLocated(By.id('loginPassword')), 1000).sendKeys(process.env.PASSWORD)
    await driver.findElement(By.xpath("//*[@id='container']/div/div[2]/div/div[2]/div/form/section/input")).click()

    // Delay for the website to make async calls so it shows the "soonest" delivery
    await delay(12000)

    // Make sure that date is there
    await driver.wait(until.elementLocated(By.xpath('/html/body/div[1]/div/div/div[2]/div/div[1]/div/div[5]/div/div[2]')), 80000)
    const date = await driver.findElement(By.xpath('/html/body/div[1]/div/div/div[2]/div/div[1]/div/div[5]/div/div[2]'))
    
    //Get text and log it with buyan
    const dateText = await date.getText()
    logger.info(`Date during render was at ${dateText}`)

    //Simple check if the delivery date matches the config
    // This returns true / false 
    const shouldIContinue = isMonthPresent(dateText, process.env.MONTH)

    if (shouldIContinue) {

      // Click the date button and wait for the menu to slide down
      await date.click()
      await delay(1000)


      //Wait and click the reservation button 
      await driver.wait(until.elementLocated(By.className('button cta with-chevron bottom-peeker tooltip-wrapper')), 80000)
      const makeReservationButton = await driver.findElement(By.className('button cta with-chevron bottom-peeker tooltip-wrapper'))
      makeReservationButton.click()
      
      //Wait for the calendar to load
      await delay(5000)

      //Set up mouse action, frisko calendar is not constructed of html clickable elements
      //There for we must manually move the mouse and click the first data available 
      const actions = driver.actions()
      const getFirstDate = await driver.findElements(By.className('calendar_column-day available'))
      const location = await getFirstDate[0].getRect()
      actions.move({ x: Number(location.x.toFixed()), y: Number(location.y.toFixed()) }).press().release().perform()
      await delay(8000)

      // After selecting the date, click the reserve button
      const orderButton = await driver.findElement(By.xpath('/html/body/div[1]/div/div/span/div/div/div[1]/div[2]/div[2]/div[2]/div/div/div[3]/div[2]/div/div[2]'))
      await orderButton.click()

      //There is a small delay between clicking and conformation pop up 
      //Making sure that selenium allows browser to send all the needed data 
      await driver.wait(until.elementLocated(By.xpath('/html/body/div[1]/div/div/span[2]/div/div/div/div/h3/span')), 120000)
      const conformationTextElement = await driver.findElement((By.xpath('/html/body/div[1]/div/div/span[2]/div/div/div/div/h3/span')))
      const conformationText = await conformationTextElement.getText();
      logger.info(`RESERVATION: ${conformationText}`)
      const isValidated = conformationText.search('Termin został zarezerwowany')
      if(isValidated >= 0){
      //Send email with the date 
        await sendEmail(dateText)
        logger.info(`RESERVATION MADE for ${dateText}`)
          
     
      //Log the job well done
        logger.info('Cron about to stop')
        
        //Stop cron so it does not keep on reserving the delivery date
        task.stop()

      }

    }
  } catch (err) {
    logger.error(err)
  } finally {
    //Finally log work and close the selenium browser
    logger.info('Cron finishing job')
    await driver.quit()
  }
}

// Start the cron job
// task.start()
runSelenium()

