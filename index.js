const {Builder, By, Key, until} = require('selenium-webdriver');
const cron = require('node-cron');
const path = require('path');
const nodemailer = require('nodemailer');
const bunyan = require('bunyan');


require('dotenv').config({
    path: path.resolve(__dirname, '.env')});

const bunyanOpts = {
        name: 'Frisko Reservation',
        streams: [
        {
            level: 'debug',
            stream: process.stdout       // log INFO and above to stdout
        },
        {
            level: 'info',
            path: path.resolve(__dirname, 'log.json'),  // log ERROR and above to a file
        }
      ]
    };
    
const logger = bunyan.createLogger(bunyanOpts);

  // create reusable transporter object using the default SMTP transport
const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: Number(process.env.EMAIL_PORT),
    secure: process.env.EMAIL_PORT === '465' ? true : false,
    auth: {
      user: process.env.EMAIL_USER, 
      pass: process.env.EMAIL_PASS, 
    },
  });

  const sendEmail = async (dateText) => {
    return await transporter.sendMail({
        from: '"Frisco app 👻" <friscoReservation@spaceout.pl>',
        to: "lukasz.celitan@gmail.com",
        subject: "Reservation Made ✔",
        html: `<p><b>Frisco App</b></p><p>Reservation date: ${dateText}`,
      });
  } 

  // send mail with defined transport object
  

const delay = (t, val) => {
    return new Promise(function(resolve) {
        setTimeout(function() {
            resolve(val);
        }, t);
    });
 }

const isMonthPresent = (text, month) => {
    if(text.search(month) > 0){
        return true
    } else {
        return false
    }
}

const task = cron.schedule(`*/${process.env.CRON} * * * *`, () =>  {
    runSelenium()
});

const runSelenium = async () => {
  logger.info(`Cron started ${new Date()}`)
  let driver = await new Builder().forBrowser('chrome').build();
  driver.manage().window().maximize();
  try {
    await driver.get('https://frisco.pl');
    await driver.findElement(By.xpath("//*[@id='header']/div/div[1]/div/div[3]/div/a[1]")).click();
    await driver.wait(until.elementLocated(By.xpath("/ html / body / div[1] / div / div[2] / div / div[2] / div / form / div / div[1] / div / input")), 1000).sendKeys(process.env.EMAIL);
    await driver.wait(until.elementLocated(By.id("loginPassword")), 1000).sendKeys(process.env.PASSWORD);
    await driver.findElement(By.xpath("//*[@id='container']/div/div[2]/div/div[2]/div/form/section/input")).click()
    await delay(8000)
    await driver.wait(until.elementLocated(By.xpath("/html/body/div[1]/div/div/div[2]/div/div[1]/div/div[5]/div/div[2]")), 80000)
    const date = await driver.findElement(By.xpath("/html/body/div[1]/div/div/div[2]/div/div[1]/div/div[5]/div/div[2]"))
    const dateText = await date.getText();
    logger.info(`Date during render was at ${dateText}`)
    
    const shouldIContinue = isMonthPresent(dateText, process.env.MONTH);

    if(shouldIContinue){
        await date.click()
        await delay(1000)
        await driver.wait(until.elementLocated(By.className('button cta with-chevron bottom-peeker tooltip-wrapper')), 80000)
        const makeReservationButton = await driver.findElement(By.className('button cta with-chevron bottom-peeker tooltip-wrapper'))
        makeReservationButton.click()
        await delay(5000)

        const actions = driver.actions();
        const getFirstDate = await driver.findElements(By.className('calendar_column-day available'))
        const location = await getFirstDate[0].getRect()
        actions.move({ x: Number(location.x.toFixed()), y: Number(location.y.toFixed()) }).press().release().perform()
        await delay(8000)
        const orderButton = await driver.findElement(By.xpath('/html/body/div[1]/div/div/span/div/div/div[1]/div[2]/div[2]/div[2]/div/div/div[3]/div[2]/div/div[2]'))
        await orderButton.click()
        await delay(8000)
        await sendEmail(dateText)
        logger.info(`RESERVATION MADE for ${dateText}`)
        logger.info('Cron about to stop')
        task.stop()
    }
    

  } finally {
    logger.info('Cron finishing job')
    await driver.quit();
  }
};

task.start()