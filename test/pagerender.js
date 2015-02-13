
var phantom=require('../node-phantom');
var assert=require('assert');
var fs=require('fs');

common = require('./files/test-common.js');

var server = common.listenServer(common.renderTestResponse);

describe('Phantom Page',function(){
	this.timeout(5000);
	it('should be able to render',function(done){
		phantom.create(function(error,ph){
			assert.ifError(error);
			ph.createPage(function(err,page){
				assert.ifError(err);
				page.open('http://localhost:'+server.address().port,function(err,status){
					assert.ifError(err);
					assert.equal(status,'success');
					page.render(common.renderTestFilename,function(err){
						assert.ifError(err);
						assert.equal(common.fileHash(common.renderTestFilename),common.fileHash(common.renderVerifyFilename));
						fs.unlinkSync(common.renderTestFilename); //clean up the testfile
						server.close();
						ph.exit();
						done();
					});
				});
			});
    });
  });
});
