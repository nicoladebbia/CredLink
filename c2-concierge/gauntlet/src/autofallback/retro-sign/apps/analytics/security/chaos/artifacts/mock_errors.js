
      // Mock origin service with 5xx errors
      const http = require('http');
      
      const server = http.createServer((req, res) => {
        const errorCodes = [500,502,503,504];
        const randomError = errorCodes[Math.floor(Math.random() * errorCodes.length)];
        
        res.writeHead(randomError, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
          error: 'Internal Server Error',
          code: randomError,
          service: 'origin_service'
        }));
      });
      
      server.listen(8081, () => {
        console.log('Mock error service started on port 8081');
      });
      
      // Auto-stop after 2 minutes
      setTimeout(() => {
        server.close();
      }, 120000);
    