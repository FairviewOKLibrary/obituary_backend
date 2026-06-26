const extractObits = (json) => {
  // Adjust this if your parsed shape differs
  const obits = json?.obits?.obit ?? json?.obits ?? [];
  if (Array.isArray(obits)) return obits;
  if (obits) return [obits];
  return [];
}


module.exports = extractObits;
