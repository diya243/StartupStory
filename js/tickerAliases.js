// A small local map of common/informal company names to tickers.
// Checked before any network search — saves an API call for the popular
// searches a demo is most likely to get, and works instantly offline of quota.
const TickerAliases = (() => {
  const MAP = {
    tesla: { symbol: "TSLA", name: "Tesla, Inc." },
    apple: { symbol: "AAPL", name: "Apple Inc." },
    google: { symbol: "GOOGL", name: "Alphabet Inc." },
    alphabet: { symbol: "GOOGL", name: "Alphabet Inc." },
    microsoft: { symbol: "MSFT", name: "Microsoft Corporation" },
    amazon: { symbol: "AMZN", name: "Amazon.com, Inc." },
    meta: { symbol: "META", name: "Meta Platforms, Inc." },
    facebook: { symbol: "META", name: "Meta Platforms, Inc." },
    nvidia: { symbol: "NVDA", name: "NVIDIA Corporation" },
    netflix: { symbol: "NFLX", name: "Netflix, Inc." },
    disney: { symbol: "DIS", name: "The Walt Disney Company" },
    "the coffee company": { symbol: "SBUX", name: "Starbucks Corporation" },
    starbucks: { symbol: "SBUX", name: "Starbucks Corporation" },
    "the ride sharing company": { symbol: "UBER", name: "Uber Technologies, Inc." },
    uber: { symbol: "UBER", name: "Uber Technologies, Inc." },
    lyft: { symbol: "LYFT", name: "Lyft, Inc." },
    airbnb: { symbol: "ABNB", name: "Airbnb, Inc." },
    spotify: { symbol: "SPOT", name: "Spotify Technology S.A." },
    salesforce: { symbol: "CRM", name: "Salesforce, Inc." },
    oracle: { symbol: "ORCL", name: "Oracle Corporation" },
    ibm: { symbol: "IBM", name: "International Business Machines" },
    intel: { symbol: "INTC", name: "Intel Corporation" },
    amd: { symbol: "AMD", name: "Advanced Micro Devices, Inc." },
    qualcomm: { symbol: "QCOM", name: "QUALCOMM Incorporated" },
    paypal: { symbol: "PYPL", name: "PayPal Holdings, Inc." },
    visa: { symbol: "V", name: "Visa Inc." },
    mastercard: { symbol: "MA", name: "Mastercard Incorporated" },
    "jp morgan": { symbol: "JPM", name: "JPMorgan Chase & Co." },
    jpmorgan: { symbol: "JPM", name: "JPMorgan Chase & Co." },
    "goldman sachs": { symbol: "GS", name: "The Goldman Sachs Group, Inc." },
    coinbase: { symbol: "COIN", name: "Coinbase Global, Inc." },
    costco: { symbol: "COST", name: "Costco Wholesale Corporation" },
    walmart: { symbol: "WMT", name: "Walmart Inc." },
    target: { symbol: "TGT", name: "Target Corporation" },
    nike: { symbol: "NKE", name: "NIKE, Inc." },
    mcdonalds: { symbol: "MCD", name: "McDonald's Corporation" },
    "mcdonald's": { symbol: "MCD", name: "McDonald's Corporation" },
    chipotle: { symbol: "CMG", name: "Chipotle Mexican Grill, Inc." },
    boeing: { symbol: "BA", name: "The Boeing Company" },
    "the airline": { symbol: "DAL", name: "Delta Air Lines, Inc." },
    delta: { symbol: "DAL", name: "Delta Air Lines, Inc." },
    ford: { symbol: "F", name: "Ford Motor Company" },
    "general motors": { symbol: "GM", name: "General Motors Company" },
    gm: { symbol: "GM", name: "General Motors Company" },
    palantir: { symbol: "PLTR", name: "Palantir Technologies Inc." },
    snowflake: { symbol: "SNOW", name: "Snowflake Inc." },
    shopify: { symbol: "SHOP", name: "Shopify Inc." },
    block: { symbol: "SQ", name: "Block, Inc." },
    square: { symbol: "SQ", name: "Block, Inc." },
    robinhood: { symbol: "HOOD", name: "Robinhood Markets, Inc." },
    reddit: { symbol: "RDDT", name: "Reddit, Inc." },
    pinterest: { symbol: "PINS", name: "Pinterest, Inc." },
    snap: { symbol: "SNAP", name: "Snap Inc." },
    snapchat: { symbol: "SNAP", name: "Snap Inc." },
    "berkshire hathaway": { symbol: "BRK.B", name: "Berkshire Hathaway Inc." },
    exxon: { symbol: "XOM", name: "Exxon Mobil Corporation" },
    chevron: { symbol: "CVX", name: "Chevron Corporation" },
    pfizer: { symbol: "PFE", name: "Pfizer Inc." },
    "johnson and johnson": { symbol: "JNJ", name: "Johnson & Johnson" },
    "johnson & johnson": { symbol: "JNJ", name: "Johnson & Johnson" },
    moderna: { symbol: "MRNA", name: "Moderna, Inc." },
    verizon: { symbol: "VZ", name: "Verizon Communications Inc." },
    "at&t": { symbol: "T", name: "AT&T Inc." },
    "t mobile": { symbol: "TMUS", name: "T-Mobile US, Inc." },
    "t-mobile": { symbol: "TMUS", name: "T-Mobile US, Inc." },
    sofi: { symbol: "SOFI", name: "SoFi Technologies, Inc." },
    doordash: { symbol: "DASH", name: "DoorDash, Inc." },
    roblox: { symbol: "RBLX", name: "Roblox Corporation" },
    unity: { symbol: "U", name: "Unity Software Inc." },
    zoom: { symbol: "ZM", name: "Zoom Video Communications, Inc." },
    peloton: { symbol: "PTON", name: "Peloton Interactive, Inc." },
  };

  function lookup(query) {
    const key = query.trim().toLowerCase();
    if (MAP[key]) return MAP[key];
    // Loose containment match, e.g. "the tesla company" -> tesla
    const found = Object.keys(MAP).find((k) => key.includes(k) || k.includes(key));
    return found ? MAP[found] : null;
  }

  return { lookup };
})();
