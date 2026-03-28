// searching "company name + company" avoids getting the wrong page (eg. Apple but we get an actual Apple)
export async function fetchWikipediaSummary(companyName: string): Promise<string> {
  try {
    // first search for the right wikipedia page
    const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(companyName + ' company')}&format=json&origin=*`;

    const searchRes = await fetch(searchUrl);
    if (!searchRes.ok) return '';

    const searchData = await searchRes.json();
    const results = searchData?.query?.search;

    if (!results || results.length === 0) return '';

    // get the title of the top result
    const pageTitle = results[0].title;

    // now fetch the actual summary for that page
    const summaryUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(pageTitle)}`;
    const summaryRes = await fetch(summaryUrl);

    if (!summaryRes.ok) return '';

    const summaryData = await summaryRes.json();
    return summaryData.extract || '';

  } catch (err) {
    // something went wrong, just return empty string
    console.log('wikipedia fetch failed for', companyName, err);
    return '';
  }
}



