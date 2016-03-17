Package.describe({
  name: 'coniel:can',
  version: '0.1.1',
  // Brief, one-line summary of the package.
  summary: 'Document level authorization made simple',
  // URL to the Git repository containing the source code for this package.
  git: 'https://github.com/coniel/can.git',
  // By default, Meteor will default to using README.md for documentation.
  // To avoid submitting documentation, set this field to null.
  documentation: 'README.md'
});

Package.onUse(function(api) {
  api.versionsFrom('1.1.0.2');
  api.use(['underscore', 'mongo']);
  api.use(['tracker'], 'client');

  api.addFiles('can.js');

  api.export('Can');
  api.export('CanPermissions');
});

Package.onTest(function(api) {
  api.use('tinytest');
  api.use('coniel:can');
  api.addFiles('can-tests.js');
});