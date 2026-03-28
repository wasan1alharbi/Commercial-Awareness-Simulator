// quick test to check the wikipedia fetch is working
const companyName = 'Apple'; // replace with the company you want to search

// search for the company
const searchRes = await fetch('https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=' + encodeURIComponent(companyName + ' company') + '&format=json&origin=*');
const searchData = await searchRes.json();
const pageTitle = searchData.query.search[0].title;

console.log('Found page:', pageTitle);

// get the summary
const summaryRes = await fetch('https://en.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(pageTitle));
const summaryData = await summaryRes.json();

console.log('Extract:', summaryData.extract);
