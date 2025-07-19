<p align="center">

<h2 align="center">Scoopify 🍧</h2>

<p align="center">

A Node.js script that scrapes and stores domain information of Shopify stores using Puppeteer and SQLite.

### Installation
```bash
git clone https://github.com/PrashantBtkl/scoopify && npm install
```

### Usage
```bash
node scraper.js
```

### Notes

Rate limiting will occur after scraping 50 pages.Runs Chrome in visible mode for solving captcha manually.
The script stores progress in SQLite, allowing for session resumption

### TODO:
* Automated Captcha Solving
* Proxy rotation
