const puppeteer = require('puppeteer');
const sqlite3 = require('sqlite3').verbose();
const axios = require('axios');

const proxyUser = 'xjkpsblg';
const proxyPass = 'ql6ktu3k13bm';
const proxyList = [
'198.23.239.134:6540'
,'207.244.217.165:6712'
,'107.172.163.27:6543'
,'64.137.42.112:5157'
,'173.211.0.148:6641'
,'161.123.152.115:6360'
,'167.160.180.203:6754'
,'154.36.110.199:6853'
,'173.0.9.70:5653'
,'173.0.9.209:5792']


async function populateProxyList() {
  try {
    // API endpoint
    const apiUrl = 'https://proxylist.geonode.com/api/proxy-list?protocols=socks5&limit=100&page=1&sort_by=lastChecked&sort_type=desc';

    // Fetch proxy data from the API
    const response = await axios.get(apiUrl);
    const proxies = response.data.data;

    // Build the protocol://ip:port combinations
    const proxyList = proxies.map(proxy => `${proxy.protocols[0]}://${proxy.ip}:${proxy.port}`);

    // Return the populated proxyList
    return proxyList;

  } catch (error) {
    console.error("Error fetching proxies:", error.message);
    return []; // Return an empty array in case of an error
  }
}

async function createRoundRobin() {
  const proxyList = await populateProxyList();
  let index = 0; // Keeps track of the current position

  return function() {
    const result = proxyList[index]; // Get the string at the current index
    index = (index + 1) % proxyList.length; // Move to the next index, wrap around if at the end
    return result;
  };
}



// Function to initialize the SQLite database and create the tables
function initDb() {
    const db = new sqlite3.Database('scraped_data.db', (err) => {
        if (err) {
            console.error('Error opening database:', err);
        } else {
            console.log('Database connected');
        }
    });

    // Create table for storing website data if it doesn't exist
    db.run(`CREATE TABLE IF NOT EXISTS websites (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        website TEXT,
        ip TEXT
    )`, (err) => {
        if (err) {
            console.error('Error creating websites table:', err);
        } else {
            console.log('websites table created or already exists');
        }
    });

    // Create table for storing pagination results if it doesn't exist
    db.run(`CREATE TABLE IF NOT EXISTS scrape_results (
        page INTEGER PRIMARY KEY,
        success BOOLEAN
    )`, (err) => {
        if (err) {
            console.error('Error creating scrape_results table:', err);
        } else {
            console.log('scrape_results table created or already exists');
        }
    });

    return db;
}

function alreadyScraped(db, pageToCheck) {
  return new Promise((resolve, reject) => {
    db.get("SELECT success FROM scrape_results WHERE page = ?", [pageToCheck], (err, row) => {
      if (err) {
        reject(err); // Reject the promise if there's an error
        return;
      }

      if (row) {
        resolve(row.success); // Resolve the promise with the `success` value
      } else {
        resolve(false); // Resolve as null if no row is found
      }
    });
  });
}

function getNotScrapedPage(db) {
  return new Promise((resolve, reject) => {
    db.get("SELECT MIN(page) AS page FROM scrape_results WHERE success = false", [], (err, row) => {
      if (err) {
        reject(err); // Reject the promise if there's an error
        return;
      }

      if (row) {
        resolve(row.page); // Resolve the promise with the `success` value
      } else {
        resolve(null); // Resolve as false if no row is found
      }
    });
  });
}

// Function to insert data into the websites table
function insertWebsiteData(db, website, ip) {
    const stmt = db.prepare('INSERT INTO websites (website, ip) VALUES (?, ?)');
    console.log(`Inserting ${website} with IP ${ip}`);
    stmt.run(website, ip, function(err) {
        if (err) {
            console.error('Error inserting data into websites table:', err);
        } else {
            // console.log(`Inserted ${website} with IP ${ip}`);
        }
    });
    stmt.finalize();
}

// Function to insert pagination result (page and success) into the database
function insertScrapeResult(db, page, success) {
    const stmt = db.prepare('INSERT OR REPLACE INTO scrape_results (page, success) VALUES (?, ?)');
    stmt.run(page, success, function(err) {
        if (err) {
            console.error(`Error inserting scrape result for page ${page}:`, err);
        } else {
            console.log(`Page ${page} result inserted (success: ${success})`);
        }
    });
    stmt.finalize();
}

// Function to scrape a page
async function scrapePage(pageNum, db, browser) {
    const page = await browser.newPage();
	await page.authenticate({
		username: proxyUser, 
		password: proxyPass 
	  });

    await page.setRequestInterception(true);
    page.on('request', request => {
        const resourceType = request.resourceType();
        if (['image', 'font'].includes(resourceType)) {
          request.abort(); // Block these resources
        } else {
          request.continue();
        }
    });


	try {
		while (pageNum) {
		    const waitForOneSecond = () => new Promise(resolve => setTimeout(resolve, 1000));
            await waitForOneSecond();
		    const scraped = await alreadyScraped(db, pageNum)  
		    if (scraped == false) {
			    await scrapeWebsiteTable(db, page, pageNum)
			}
		    pageNum = await getNotScrapedPage(db)
		    if (pageNum == null) {
				pageNum = await clickOnNextPage(page)
			} else {
				await openPage(page, pageNum)
			}
		}
	} catch(error) {
		 console.error(`Failed to scrape page ${pageNum}:`, error);
	} finally {
		 await page.close();
	}
}

async function openPage(page, pageNum) {
    console.log(`Opening new page ${pageNum} from url...`);
    const url = `https://myip.ms/browse/sites/${pageNum}/ipID/23.227.38.0/ipIDii/23.227.38.255/sort/6/asc/1`;
    await page.goto(url, { waitUntil: 'domcontentloaded' });
}

async function scrapeWebsiteTable(db, page, pageNum) {
   let success = false;
    try {
        await page.waitForSelector('a#tablink-1.ui-tabs-anchor'); // Adjust the selector if necessary
          // Extract the text content
          const text = await page.$eval('a#tablink-1.ui-tabs-anchor', el => el.textContent);
          // Log the result
          if (text.includes("You have exceeded page visit limit")) {
            // console.log("exceeded ratelimit for current ip/proxy");
             // process.exit()
		     throw `exceeded ratelimit for current ip/proxy`;
          } else {
            // console.log("Text not found.");
          }

        await page.waitForSelector('#sites_tbl'); // Ensure the table is loaded
        // Extract data from the table
        const data = await page.evaluate(() => {
            const rows = Array.from(document.querySelectorAll('#sites_tbl tbody tr'));
            return rows.map(row => {
                const website = row.cells[1]?.querySelector('a')?.textContent.trim();
                const ip = row.cells[2]?.querySelector('a')?.textContent.trim();
                return { website, ip };
            }).filter(item => item.website && item.ip);
        });

        // Log the scraped data (you can store it in your database here)
        console.log(`Scraped ${data.length} rows from page ${pageNum}`);
		if (data.length == 0) {
         throw `failed to scrape page ${pageNum}, zero items found`;
		}

        // Store the scraped data in the SQLite database
        data.forEach(item => insertWebsiteData(db, item.website, item.ip));

        // Mark success for the page
        success = true;
    } catch (error) {
        console.error(`Failed to scrape page ${pageNum}:`, error);
    } finally {
        // Insert the result for this page (whether it succeeded or failed)
        insertScrapeResult(db, pageNum, success);
    }
}

async function clickOnNextPage(page) {
		let nextPage = null
		try {
		await page.waitForSelector('div.aqPsites_tbl.aqPaging');
		nextPage = await page.evaluate(() => {
        // Find the parent div
        const parentDiv = document.querySelector('div.aqPsites_tbl.aqPaging');
        if (!parentDiv) return false;

        // Get all anchor tags within the div
        const links = Array.from(parentDiv.querySelectorAll('a'));

        // Find the index of the currently selected anchor tag
        const currentIndex = links.findIndex(link => link.classList.contains('aqPagingSel'));
        if (currentIndex === -1 || currentIndex === links.length - 1) {
            // Either no selected link or the current one is the last in the list
            return false;
        }

        // Get the next anchor tag
        const nextLink = links[currentIndex + 1];
        if (nextLink) {
		    const pageNumber = nextLink.textContent.trim();
            nextLink.click(); // Click the next link
            return pageNumber;
        }
        return null;
    });
		} catch(error) {
			throw `failed to click on next page: ${error}`
		} finally {
		   if (nextPage) {
    	       console.log(`Next page clicked! Link text: "${nextPage}"`);
		   	return nextPage
    	   } else {
    	       throw 'Failed to click the next page (maybe already on the last page).';
    	   }
		}
}

// Main function to handle pagination and store results in SQLite
async function scrapeData() {
    // Initialize SQLite database and tables
    const db = initDb();

    const browser = await puppeteer.launch({
        headless: false, // Launch Chrome with UI (non-headless mode)
        executablePath: '/usr/bin/google-chrome', // Specify the path to your installed Chrome
        args: ['--no-sandbox', '--disable-setuid-sandbox', `--proxy-server=${proxyList[3]}`],
    });

    //const proxyHost = await createRoundRobin();

    // Loop through pages 1 to 13500 (or any other number you choose)
    for (let pageNum = 1; pageNum <= 13500; pageNum++) {
        const scraped = await alreadyScraped(db, pageNum);
		if (scraped == false) {
		   console.log(`Scraping page ${pageNum}...`);
           await scrapePage(pageNum, db, browser);
		} else { 
		   console.log(`Already scraped page ${pageNum}`);
		}
    }

    // Close the database connection after all pages are scraped
    db.close();
}

// Run the scraping function
scrapeData().catch((error) => {
    console.error('Error in scraping:', error);
});
