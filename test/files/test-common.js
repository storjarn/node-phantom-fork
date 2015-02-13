
if( module == null ){
  module = {};
}

var http=require('http');
var fs=require('fs');
var crypto = require('crypto');

obj = {

  renderFontFilename:__dirname+'/fonts-motoya-l-cedar/MTLc3m.ttf',
  renderTestFilename:__dirname+'/testrender.png',
  renderVerifyFilename:__dirname+'/verifyrender.png',

  fileHash: function fileHash(filename){
    var shasum=crypto.createHash('sha256');
    var f=fs.readFileSync(filename);
    shasum.update(f);
    return shasum.digest('hex');
  },

  bufferHash: function bufferHash(buffer){
    var shasum=crypto.createHash('sha256');
    shasum.update(buffer);
    return shasum.digest('hex');
  },

  listenServer: function getServer(responseString){
    return http.createServer(function(request,response){
      response.writeHead(200,{"Content-Type": "text/html"});
      response.end(responseString);

    }).listen();
  },
};

obj.renderTestResponse = 
    "<html><head><style>"+
      "@font-face{font-family:'TestFont';src:url('"+obj.renderFontFilename+"') format('truetype');}"+
      "body{font-family:'TestFont';}"+
    "</style></head><body>Hello World</body></html>";


module.exports = obj;


