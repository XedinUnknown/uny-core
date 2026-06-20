export default (providers) => {
  providers.set('test-transform', {
    definitions: {
      'test/key': () => 'test-value',
    },
  });
  return providers;
};
