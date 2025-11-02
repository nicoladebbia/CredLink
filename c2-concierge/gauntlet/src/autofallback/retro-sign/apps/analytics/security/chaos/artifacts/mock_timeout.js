
      // Mock TSA service timeout simulation
      const http = require('http');
      
      const server = http.createServer((req, res) => {
        // Simulate timeout by never responding
        setTimeout(() => {
          res.writeHead(504, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Gateway Timeout' }));
        }, 30000); // 30 second timeout
      });
      
      server.listen(8080, () => {
        console.log('Mock timeout service started on port 8080');
      });
      
      // Auto-stop after 2 minutes
      setTimeout(() => {
        server.close();
      }, 120000);
    