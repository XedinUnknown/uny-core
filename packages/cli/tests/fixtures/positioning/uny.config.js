export default (providers) => {
  // Insert 'positioned' right after 'core' by rebuilding the map.
  const next = new Map();
  for (const [key, value] of providers) {
    next.set(key, value);
    if (key === 'core') {
      next.set('positioned', {
        definitions: {
          'positioned/key': () => 'positioned-value',
        },
      });
    }
  }
  return next;
};
