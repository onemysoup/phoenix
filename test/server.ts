import http from "http";
import fs from "fs";
import path from "path";

const PORT = 3456;

const pages: Record<string, string> = {
  "/": `<!DOCTYPE html>
<html><head><title>Phoenix Test Home</title></head>
<body>
  <h1>Phoenix Test Pages</h1>
  <ul>
    <li><a href="/shadow">Shadow DOM Test</a></li>
    <li><a href="/iframe">Iframe Test</a></li>
    <li><a href="/infinite">Infinite Scroll Test</a></li>
    <li><a href="/spa">SPA Route Test</a></li>
    <li><a href="/dynamic">Dynamic Content Test</a></li>
  </ul>
</body></html>`,

  "/shadow": `<!DOCTYPE html>
<html><head><title>Shadow DOM Test</title></head>
<body>
  <h1>Shadow DOM Test Page</h1>
  <div id="shadow-host"></div>
  <div id="nested-host"></div>
  <script>
    // Simple shadow DOM
    const host = document.getElementById('shadow-host');
    const sr = host.attachShadow({ mode: 'open' });
    sr.innerHTML = '<div class="card"><h2>Shadow Title</h2><p>Shadow content inside</p><a href="#">Shadow Link</a></div>';

    // Nested shadow DOM
    const nested = document.getElementById('nested-host');
    const sr2 = nested.attachShadow({ mode: 'open' });
    const inner = document.createElement('div');
    inner.setAttribute('id', 'inner-host');
    sr2.appendChild(inner);
    const sr3 = inner.attachShadow({ mode: 'open' });
    sr3.innerHTML = '<span class="deep-text">Deep nested shadow content</span>';
  </script>
</body></html>`,

  "/iframe": `<!DOCTYPE html>
<html><head><title>Iframe Test</title></head>
<body>
  <h1>Iframe Test Page</h1>
  <iframe id="frame1" name="content-frame" srcdoc="<h2>Iframe Content</h2><p>Hello from iframe 1</p><button onclick='parent.postMessage(\\\"clicked\\\", \\\"*\\\")'>Click Me</button>" style="width:400px;height:200px;border:2px solid blue;"></iframe>
  <iframe id="frame2" srcdoc="<h2>Second Frame</h2><ul><li>Item A</li><li>Item B</li></ul>" style="width:400px;height:200px;border:2px solid green;"></iframe>
  <div id="msg-area"></div>
  <script>
    window.addEventListener('message', e => {
      document.getElementById('msg-area').textContent = 'Received: ' + e.data;
    });
  </script>
</body></html>`,

  "/infinite": `<!DOCTYPE html>
<html><head><title>Infinite Scroll Test</title></head>
<body>
  <h1>Infinite Scroll Test</h1>
  <div id="items"></div>
  <div id="sentinel" style="height:1px;"></div>
  <script>
    let page = 0;
    const container = document.getElementById('items');
    function loadMore() {
      for (let i = 0; i < 10; i++) {
        const div = document.createElement('div');
        div.className = 'item';
        div.textContent = 'Item ' + (page * 10 + i + 1);
        div.style.padding = '20px';
        div.style.borderBottom = '1px solid #ccc';
        container.appendChild(div);
      }
      page++;
    }
    loadMore(); // initial load
    // Expose loadMore globally for direct calls
    window.loadMore = loadMore;
    // IntersectionObserver for reliable infinite scroll detection
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        setTimeout(loadMore, 200);
      }
    });
    observer.observe(document.getElementById('sentinel'));
    // Also listen for scroll as fallback
    window.addEventListener('scroll', () => {
      if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 50) {
        setTimeout(loadMore, 200);
      }
    });
  </script>
</body></html>`,

  "/spa": `<!DOCTYPE html>
<html><head><title>SPA Route Test</title></head>
<body>
  <h1>SPA Route Test</h1>
  <nav>
    <a href="#" onclick="navigate('/spa/home')">Home</a>
    <a href="#" onclick="navigate('/spa/about')">About</a>
    <a href="#" onclick="navigate('/spa/contact')">Contact</a>
  </nav>
  <div id="view"><p>Initial view</p></div>
  <script>
    function navigate(route) {
      history.pushState({ route }, '', route);
      render(route);
    }
    function render(route) {
      const view = document.getElementById('view');
      const page = route.split('/').pop();
      view.innerHTML = '<h2>' + page.charAt(0).toUpperCase() + page.slice(1) + ' Page</h2><p>Content for ' + page + '</p>';
    }
    window.addEventListener('popstate', (e) => {
      if (e.state?.route) render(e.state.route);
    });
  </script>
</body></html>`,

  "/dynamic": `<!DOCTYPE html>
<html><head><title>Dynamic Content Test</title></head>
<body>
  <h1>Dynamic Content Test</h1>
  <button id="load-btn">Load Content</button>
  <div id="result"></div>
  <div id="counter">0</div>
  <script>
    document.getElementById('load-btn').addEventListener('click', () => {
      setTimeout(() => {
        document.getElementById('result').innerHTML = '<p class="loaded">Content loaded after delay!</p>';
      }, 2000);
    });
    let count = 0;
    setInterval(() => {
      count++;
      document.getElementById('counter').textContent = count;
    }, 500);
  </script>
</body></html>`,

  // Self-healing test: simple page with stable elements
  "/healing": `<!DOCTYPE html>
<html><head><title>Self-Healing Test</title></head>
<body>
  <h1>Self-Healing Test Page</h1>
  <button id="target-btn">Target Button</button>
  <div id="output"></div>
</body></html>`,

  // Anti-bot simulation
  "/blocked": `<!DOCTYPE html>
<html><head><title>403 Forbidden</title></head>
<body>
  <h1>403 Forbidden</h1>
  <p>Access denied. Your IP has been blocked.</p>
</body></html>`,

  // Cloudflare challenge simulation
  "/challenge": `<!DOCTYPE html>
<html><head><title>Just a moment...</title></head>
<body>
  <div id="challenge-running">
    <h2>Checking your browser before accessing the site.</h2>
    <p>This process is automatic. Your browser will redirect shortly.</p>
  </div>
</body></html>`,
};

const server = http.createServer((req, res) => {
  const url = req.url?.split("?")[0] || "/";
  const html = pages[url];
  if (html) {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html);
  } else {
    res.writeHead(404);
    res.end("Not found");
  }
});

server.listen(PORT, () => {
  console.log(`Test server running at http://localhost:${PORT}`);
});

// Graceful shutdown
process.on("SIGINT", () => { server.close(); process.exit(0); });
process.on("SIGTERM", () => { server.close(); process.exit(0); });
