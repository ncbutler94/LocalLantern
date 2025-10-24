const { createProxyMiddleware } = require('http-proxy-middleware');
const target = 'http://localhost:4001';

module.exports = function(app) {
    app.use(
        ['/api','/auth','/users'],
        createProxyMiddleware({
            target,
            secure: false,
            changeOrigin: true
        })
    );
};
