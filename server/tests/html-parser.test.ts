import { describe, expect, it } from "vitest";

import { parseHtml } from "../routes/node-adapters/html-parser.js";

describe("parseHtml", () => {
  describe("content extraction", () => {
    it("removes script, style, and noscript tags with their content", () => {
      const html = `
        <html>
          <head>
            <title>Test Page</title>
            <style>body { color: red; }</style>
          </head>
          <body>
            <script>alert('xss')</script>
            <noscript>Enable JS</noscript>
            <p>Visible content here.</p>
            <style>.hidden { display: none; }</style>
          </body>
        </html>
      `;

      const result = parseHtml(html);
      expect(result.content).toContain("Visible content here.");
      expect(result.content).not.toContain("alert");
      expect(result.content).not.toContain("color: red");
      expect(result.content).not.toContain("Enable JS");
      expect(result.content).not.toContain("display: none");
    });

    it("removes nav, footer, header, and aside elements", () => {
      const html = `
        <html>
          <body>
            <header><nav><a href="/">Home</a></nav></header>
            <main>
              <p>Main content paragraph.</p>
            </main>
            <aside>Sidebar info</aside>
            <footer>Copyright 2024</footer>
          </body>
        </html>
      `;

      const result = parseHtml(html);
      expect(result.content).toContain("Main content paragraph.");
      expect(result.content).not.toContain("Sidebar info");
      expect(result.content).not.toContain("Copyright 2024");
    });

    it("prefers article content over full body", () => {
      const html = `
        <html>
          <body>
            <div class="sidebar">Sidebar noise</div>
            <article>
              <h1>Article Title</h1>
              <p>Article body text.</p>
            </article>
            <div class="ads">Buy stuff</div>
          </body>
        </html>
      `;

      const result = parseHtml(html);
      expect(result.content).toContain("Article Title");
      expect(result.content).toContain("Article body text.");
      expect(result.content).not.toContain("Sidebar noise");
      expect(result.content).not.toContain("Buy stuff");
    });

    it("prefers main content when no article exists", () => {
      const html = `
        <html>
          <body>
            <div class="banner">Banner noise</div>
            <main>
              <h2>Main Section</h2>
              <p>Important content.</p>
            </main>
            <div class="footer-links">Footer links</div>
          </body>
        </html>
      `;

      const result = parseHtml(html);
      expect(result.content).toContain("Main Section");
      expect(result.content).toContain("Important content.");
      expect(result.content).not.toContain("Banner noise");
      expect(result.content).not.toContain("Footer links");
    });

    it("preserves paragraph structure with newlines", () => {
      const html = `
        <body>
          <p>First paragraph.</p>
          <p>Second paragraph.</p>
          <div>A div block.</div>
        </body>
      `;

      const result = parseHtml(html);
      // Block-level elements produce newline separators
      expect(result.content).toContain("First paragraph.");
      expect(result.content).toContain("Second paragraph.");
      expect(result.content).toContain("A div block.");
      // Paragraphs are separated (not merged into one line)
      const lines = result.content.split("\n").filter(l => l.trim());
      expect(lines).toContain("First paragraph.");
      expect(lines).toContain("Second paragraph.");
      expect(lines).toContain("A div block.");
    });

    it("decodes HTML entities", () => {
      const html = `
        <body>
          <p>Tom &amp; Jerry &lt;3 &quot;cartoons&quot; &#39;forever&#39;</p>
        </body>
      `;

      const result = parseHtml(html);
      expect(result.content).toContain('Tom & Jerry <3 "cartoons" \'forever\'');
    });

    it("removes HTML comments", () => {
      const html = `
        <body>
          <!-- This is a comment -->
          <p>Visible text.</p>
          <!-- Another comment with <tags> inside -->
        </body>
      `;

      const result = parseHtml(html);
      expect(result.content).toBe("Visible text.");
      expect(result.content).not.toContain("comment");
    });

    it("handles empty or minimal HTML gracefully", () => {
      expect(parseHtml("").content).toBe("");
      expect(parseHtml("<html></html>").content).toBe("");
      expect(parseHtml("<body>   </body>").content).toBe("");
    });
  });

  describe("metadata extraction", () => {
    it("extracts title from <title> tag", () => {
      const html = `
        <html>
          <head><title>My Page Title</title></head>
          <body><p>Content</p></body>
        </html>
      `;

      const result = parseHtml(html);
      expect(result.metadata.title).toBe("My Page Title");
    });

    it("falls back to h1 when no title tag exists", () => {
      const html = `
        <html>
          <body>
            <h1>Heading as Title</h1>
            <p>Content</p>
          </body>
        </html>
      `;

      const result = parseHtml(html);
      expect(result.metadata.title).toBe("Heading as Title");
    });

    it("extracts meta description", () => {
      const html = `
        <html>
          <head>
            <title>Page</title>
            <meta name="description" content="A brief description of the page." />
          </head>
          <body><p>Content</p></body>
        </html>
      `;

      const result = parseHtml(html);
      expect(result.metadata.description).toBe("A brief description of the page.");
    });

    it("extracts meta description with reversed attribute order", () => {
      const html = `
        <html>
          <head>
            <meta content="Reversed order description" name="description" />
          </head>
          <body><p>Content</p></body>
        </html>
      `;

      const result = parseHtml(html);
      expect(result.metadata.description).toBe("Reversed order description");
    });

    it("falls back to og:description when no meta description", () => {
      const html = `
        <html>
          <head>
            <meta property="og:description" content="OG description fallback" />
          </head>
          <body><p>Content</p></body>
        </html>
      `;

      const result = parseHtml(html);
      expect(result.metadata.description).toBe("OG description fallback");
    });

    it("extracts og:image", () => {
      const html = `
        <html>
          <head>
            <meta property="og:image" content="https://example.com/image.png" />
          </head>
          <body><p>Content</p></body>
        </html>
      `;

      const result = parseHtml(html);
      expect(result.metadata.ogImage).toBe("https://example.com/image.png");
    });

    it("returns empty strings for missing metadata", () => {
      const html = `<body><p>No metadata here</p></body>`;

      const result = parseHtml(html);
      expect(result.metadata.title).toBe("");
      expect(result.metadata.description).toBe("");
      expect(result.metadata.ogImage).toBe("");
    });
  });

  describe("link extraction", () => {
    it("extracts links with text and href", () => {
      const html = `
        <body>
          <a href="https://example.com/page1">Page One</a>
          <a href="https://example.com/page2">Page Two</a>
        </body>
      `;

      const result = parseHtml(html);
      expect(result.links).toEqual([
        { href: "https://example.com/page1", text: "Page One" },
        { href: "https://example.com/page2", text: "Page Two" },
      ]);
    });

    it("uses href as text when link text is empty", () => {
      const html = `
        <body>
          <a href="https://example.com/empty"></a>
          <a href="https://example.com/spaces">   </a>
        </body>
      `;

      const result = parseHtml(html);
      expect(result.links[0]).toEqual({
        href: "https://example.com/empty",
        text: "https://example.com/empty",
      });
    });

    it("strips HTML tags from link text", () => {
      const html = `
        <body>
          <a href="https://example.com"><strong>Bold Link</strong> text</a>
        </body>
      `;

      const result = parseHtml(html);
      expect(result.links[0]?.text).toBe("Bold Link text");
    });

    it("skips fragment-only links (href starting with #)", () => {
      const html = `
        <body>
          <a href="#section1">Jump to section</a>
          <a href="https://example.com/real">Real link</a>
        </body>
      `;

      const result = parseHtml(html);
      expect(result.links).toHaveLength(1);
      expect(result.links[0]?.href).toBe("https://example.com/real");
    });

    it("deduplicates links by href", () => {
      const html = `
        <body>
          <a href="https://example.com/dup">First</a>
          <a href="https://example.com/dup">Second</a>
          <a href="https://example.com/unique">Unique</a>
        </body>
      `;

      const result = parseHtml(html);
      expect(result.links).toHaveLength(2);
      expect(result.links[0]?.text).toBe("First");
    });

    it("respects maxLinks option", () => {
      const links = Array.from({ length: 50 }, (_, i) =>
        `<a href="https://example.com/${i}">Link ${i}</a>`,
      ).join("\n");
      const html = `<body>${links}</body>`;

      const result = parseHtml(html, { maxLinks: 5 });
      expect(result.links).toHaveLength(5);
    });

    it("extracts links from content area (article) not full page", () => {
      const html = `
        <html>
          <body>
            <nav><a href="/nav-link">Nav</a></nav>
            <article>
              <a href="/article-link">Article Link</a>
            </article>
          </body>
        </html>
      `;

      const result = parseHtml(html);
      // Since article is extracted as content area, only article links are found
      expect(result.links).toEqual([
        { href: "/article-link", text: "Article Link" },
      ]);
    });
  });

  describe("complex real-world HTML", () => {
    it("handles a typical blog post page", () => {
      const html = `
        <!DOCTYPE html>
        <html lang="zh-CN">
          <head>
            <meta charset="utf-8" />
            <title>如何配置 Nginx 反向代理</title>
            <meta name="description" content="本文介绍 Nginx 反向代理的基本配置方法。" />
            <meta property="og:image" content="https://blog.example.com/nginx.png" />
            <style>* { margin: 0; }</style>
            <script>window.ga = function() {};</script>
          </head>
          <body>
            <header>
              <nav><a href="/">首页</a><a href="/blog">博客</a></nav>
            </header>
            <main>
              <article>
                <h1>如何配置 Nginx 反向代理</h1>
                <p>Nginx 是一个高性能的 HTTP 服务器和反向代理。</p>
                <p>以下是基本配置步骤：</p>
                <ol>
                  <li>安装 Nginx</li>
                  <li>编辑配置文件</li>
                  <li>重启服务</li>
                </ol>
                <a href="https://nginx.org/en/docs/">Nginx 官方文档</a>
              </article>
            </main>
            <aside>
              <h3>相关文章</h3>
              <a href="/related">相关链接</a>
            </aside>
            <footer>
              <p>&copy; 2024 Blog</p>
            </footer>
          </body>
        </html>
      `;

      const result = parseHtml(html);

      // Metadata
      expect(result.metadata.title).toBe("如何配置 Nginx 反向代理");
      expect(result.metadata.description).toBe("本文介绍 Nginx 反向代理的基本配置方法。");
      expect(result.metadata.ogImage).toBe("https://blog.example.com/nginx.png");

      // Content
      expect(result.content).toContain("Nginx 是一个高性能的 HTTP 服务器和反向代理");
      expect(result.content).toContain("安装 Nginx");
      expect(result.content).not.toContain("window.ga");
      expect(result.content).not.toContain("margin: 0");
      expect(result.content).not.toContain("© 2024 Blog");

      // Links (from article content area)
      expect(result.links).toEqual([
        { href: "https://nginx.org/en/docs/", text: "Nginx 官方文档" },
      ]);
    });

    it("handles iframe and svg removal", () => {
      const html = `
        <body>
          <p>Before iframe.</p>
          <iframe src="https://ads.example.com" width="300" height="250">Fallback</iframe>
          <svg xmlns="http://www.w3.org/2000/svg"><circle cx="50" cy="50" r="40"/></svg>
          <p>After iframe.</p>
        </body>
      `;

      const result = parseHtml(html);
      expect(result.content).toContain("Before iframe.");
      expect(result.content).toContain("After iframe.");
      expect(result.content).not.toContain("ads.example.com");
      expect(result.content).not.toContain("circle");
    });
  });
});
