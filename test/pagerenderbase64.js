var phantom=require('../node-phantom');
var assert=require('assert');

common = require('./files/test-common.js');

var server = common.listenServer(common.renderTestResponse);

describe('Phantom Page',function(){
	this.timeout(5000);
	it('should be able to render base 64',function(done){
		phantom.create(function(error,ph){
			assert.ifError(error);
			ph.createPage(function(err,page){
				assert.ifError(err);
				page.open('http://localhost:'+server.address().port,function(err,status){
					assert.ifError(err);
					assert.equal(status,'success');
					page.renderBase64('png',function(err, imagedata){
						assert.ifError(err);
						assert.equal(common.bufferHash(new Buffer(imagedata, 'base64')),common.fileHash(common.renderVerifyFilename));
						server.close();
						ph.exit();
						done();
					});
				});
			});
		});
	});
});
