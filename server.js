const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const PRODUCTS = Object.freeze({
  "essential-series": { name: "Essential Series", price: 1920000 },
  "nocturne-bag": { name: "Nocturne Bag", price: 2880000 },
  "street-utility": { name: "Street Utility", price: 2320000 },
  "after-dark": { name: "After Dark", price: 3360000 },
  "shadow-edition": { name: "Shadow Edition", price: 2640000 },
  "archive-drop": { name: "Archive Drop", price: 3120000 },
});

const CONTENT_TYPES = Object.freeze({
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
});
const PUBLIC_FILES = new Set([
  "index.html",
  "catalog.html",
  "gallery.html",
  "product.html",
  "policies.html",
  "shop.js",
  "shop.css",
  "banner.png",
  "carosel1.jpg",
  "carosel2.jpg",
  "gambar1.png",
  "karosel1.jpg",
  "karosel2.jpg",
  "karosel3.jpg",
  "logo1.png",
  "navbar top.png",
  "produk.jpg",
  "produk2.png",
]);
const MAX_BODY_BYTES = 32 * 1024;
const MAX_ITEMS = 20;

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(JSON.stringify(payload));
}

async function readJson(request) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      const error = new Error("Request body is too large.");
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    const error = new Error("Request body must be valid JSON.");
    error.statusCode = 400;
    throw error;
  }
}

function cleanText(value, maximumLength) {
  return typeof value === "string" ? value.trim().slice(0, maximumLength) : "";
}

function validateCheckout(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { error: "Invalid checkout details." };
  }

  const customerInput = payload.customer;
  if (!customerInput || typeof customerInput !== "object" || Array.isArray(customerInput)) {
    return { error: "Please provide your delivery details." };
  }

  const name = cleanText(customerInput.name, 100);
  const phone = cleanText(customerInput.phone, 24);
  const address = cleanText(customerInput.address, 600);
  const note = cleanText(customerInput.note, 400);
  if (name.length < 2) return { error: "Please enter your name." };
  if (!/^\+?[0-9\s()-]{8,24}$/.test(phone)) return { error: "Please enter a valid phone number." };
  if (address.length < 8) return { error: "Please enter a complete delivery address." };

  if (!Array.isArray(payload.items) || payload.items.length === 0 || payload.items.length > Object.keys(PRODUCTS).length) {
    return { error: "Your shopping bag is empty or invalid." };
  }

  const seenIds = new Set();
  const items = [];
  for (const item of payload.items) {
    if (!item || typeof item !== "object" || typeof item.id !== "string" || !PRODUCTS[item.id]) {
      return { error: "The order contains an unavailable product." };
    }
    if (seenIds.has(item.id)) return { error: "Duplicate product entries are not allowed." };
    if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > MAX_ITEMS) {
      return { error: "Product quantity must be between 1 and 20." };
    }
    seenIds.add(item.id);
    items.push({ id: item.id, name: PRODUCTS[item.id].name, price: PRODUCTS[item.id].price, quantity: item.quantity });
  }

  const amount = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  if (!Number.isSafeInteger(amount) || amount <= 0) return { error: "The order total is invalid." };

  return { value: { amount, items, customer: { name, phone, address, note } } };
}

function timingSafeTokenMatch(received, expected) {
  if (typeof received !== "string" || !expected) return false;
  const receivedBuffer = Buffer.from(received);
  const expectedBuffer = Buffer.from(expected);
  return receivedBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(receivedBuffer, expectedBuffer);
}

function createServer(options = {}) {
  const root = path.resolve(options.root || __dirname);
  const dataFile = path.resolve(options.dataFile || path.join(root, "data", "orders.json"));
  const apiKey = options.apiKey ?? process.env.XENDIT_API_KEY ?? "";
  const callbackToken = options.callbackToken ?? process.env.XENDIT_CALLBACK_TOKEN ?? "";
  const xenditBaseUrl = (options.xenditBaseUrl || "https://api.xendit.co").replace(/\/$/, "");
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const configuredBaseUrl = options.appBaseUrl ?? process.env.APP_BASE_URL ?? "";
  const nodeEnvironment = options.nodeEnv ?? process.env.NODE_ENV ?? "development";
  const configuredPort = Number(options.port ?? process.env.PORT ?? 3000);
  let orders = new Map();
  let storageWrite = Promise.resolve();

  try {
    const saved = JSON.parse(fs.readFileSync(dataFile, "utf8"));
    if (Array.isArray(saved)) orders = new Map(saved.filter((order) => order && typeof order.orderId === "string").map((order) => [order.orderId, order]));
  } catch (error) {
    if (error.code !== "ENOENT") throw new Error(`Could not load order storage: ${error.message}`);
  }

  async function persistOrders() {
    storageWrite = storageWrite.then(async () => {
      await fs.promises.mkdir(path.dirname(dataFile), { recursive: true });
      const temporaryFile = `${dataFile}.${process.pid}.tmp`;
      await fs.promises.writeFile(temporaryFile, JSON.stringify([...orders.values()], null, 2), { mode: 0o600 });
      await fs.promises.rename(temporaryFile, dataFile);
    });
    return storageWrite;
  }

  function getBaseUrl() {
    const candidate = configuredBaseUrl || (nodeEnvironment === "production" ? "" : `http://localhost:${configuredPort}`);
    if (!candidate) throw new Error("APP_BASE_URL must be configured in production.");

    let baseUrl;
    try {
      baseUrl = new URL(candidate);
    } catch {
      throw new Error("APP_BASE_URL must be a valid origin.");
    }

    if (!["http:", "https:"].includes(baseUrl.protocol) || baseUrl.pathname !== "/" || baseUrl.search || baseUrl.hash || baseUrl.username || baseUrl.password) {
      throw new Error("APP_BASE_URL must contain only an HTTP(S) origin.");
    }
    if (nodeEnvironment === "production" && baseUrl.protocol !== "https:") {
      throw new Error("APP_BASE_URL must use HTTPS in production.");
    }
    return baseUrl.origin;
  }

  async function serveStatic(request, response, pathname) {
    if (request.method !== "GET" && request.method !== "HEAD") {
      sendJson(response, 405, { error: "Method not allowed." });
      return;
    }

    let decodedPath;
    try {
      decodedPath = decodeURIComponent(pathname);
    } catch {
      sendJson(response, 400, { error: "Invalid URL path." });
      return;
    }

    const relativePath = decodedPath === "/" ? "index.html" : decodedPath.replace(/^\/+/, "");
    if (!PUBLIC_FILES.has(relativePath.replace(/\\/g, "/"))) {
      sendJson(response, 404, { error: "Not found." });
      return;
    }
    const filePath = path.resolve(root, relativePath);
    if (!filePath.startsWith(`${root}${path.sep}`) || relativePath.split(/[\\/]/).some((part) => part.startsWith("."))) {
      sendJson(response, 404, { error: "Not found." });
      return;
    }

    const extension = path.extname(filePath).toLowerCase();
    if (!CONTENT_TYPES[extension]) {
      sendJson(response, 404, { error: "Not found." });
      return;
    }

    try {
      const file = await fs.promises.readFile(filePath);
      response.writeHead(200, {
        "Cache-Control": extension === ".html" ? "no-cache" : "public, max-age=3600",
        "Content-Length": file.length,
        "Content-Security-Policy": "frame-ancestors 'none'; base-uri 'self'; object-src 'none'",
        "Content-Type": CONTENT_TYPES[extension],
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
      });
      response.end(request.method === "HEAD" ? undefined : file);
    } catch (error) {
      if (error.code === "ENOENT" || error.code === "EISDIR") {
        sendJson(response, 404, { error: "Not found." });
        return;
      }
      throw error;
    }
  }

  async function createInvoice(request, response) {
    if (request.method !== "POST") {
      sendJson(response, 405, { error: "Method not allowed." });
      return;
    }
    if (!apiKey) {
      sendJson(response, 503, { error: "Xendit is not configured. Set XENDIT_API_KEY in .env." });
      return;
    }

    const payload = await readJson(request);
    const validation = validateCheckout(payload);
    if (validation.error) {
      sendJson(response, 400, { error: validation.error });
      return;
    }

    let baseUrl;
    try {
      baseUrl = getBaseUrl();
    } catch (error) {
      sendJson(response, 503, { error: error.message });
      return;
    }

    const { amount, items, customer } = validation.value;
    const orderId = `ZSC-${crypto.randomUUID()}`;
    const order = {
      orderId,
      status: "CREATING_INVOICE",
      currency: "IDR",
      amount,
      items,
      customer,
      createdAt: new Date().toISOString(),
    };
    orders.set(orderId, order);
    await persistOrders();

    const description = `ZSCMMR order ${orderId}: ${items.map((item) => `${item.name} x${item.quantity}`).join(", ")}`.slice(0, 255);
    const invoicePayload = {
      external_id: orderId,
      amount,
      currency: "IDR",
      description,
      invoice_duration: 86400,
      items: items.map((item) => ({
        name: item.name,
        quantity: item.quantity,
        price: item.price,
        reference_id: item.id,
      })),
      success_redirect_url: `${baseUrl}/?payment=success&order=${encodeURIComponent(orderId)}`,
      failure_redirect_url: `${baseUrl}/?payment=failed&order=${encodeURIComponent(orderId)}`,
    };

    let invoiceResponse;
    try {
      invoiceResponse = await fetchImpl(`${xenditBaseUrl}/v2/invoices`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(invoicePayload),
        signal: AbortSignal.timeout(15000),
      });
    } catch {
      order.status = "CREATE_FAILED";
      await persistOrders();
      sendJson(response, 502, { error: "Could not connect to Xendit. Please try again." });
      return;
    }

    const invoice = await invoiceResponse.json().catch(() => ({}));
    if (!invoiceResponse.ok || !invoice.invoice_url || !invoice.id) {
      order.status = "CREATE_FAILED";
      await persistOrders();
      sendJson(response, 502, { error: "Xendit could not create the payment invoice. Check your API key and invoice settings." });
      return;
    }

    order.status = "PENDING";
    order.invoiceId = invoice.id;
    order.invoiceUrl = invoice.invoice_url;
    order.expiresAt = invoice.expiry_date || null;
    await persistOrders();
    sendJson(response, 201, { orderId, invoiceUrl: invoice.invoice_url, amount, currency: "IDR", expiresAt: order.expiresAt });
  }

  async function receiveWebhook(request, response) {
    if (request.method !== "POST") {
      sendJson(response, 405, { error: "Method not allowed." });
      return;
    }
    if (!callbackToken) {
      sendJson(response, 503, { error: "Xendit webhook callback token is not configured." });
      return;
    }
    if (!timingSafeTokenMatch(request.headers["x-callback-token"], callbackToken)) {
      sendJson(response, 401, { error: "Invalid callback token." });
      return;
    }

    const event = await readJson(request);
    if (typeof event.external_id !== "string" || typeof event.status !== "string") {
      sendJson(response, 400, { error: "Invalid invoice callback payload." });
      return;
    }

    const order = orders.get(event.external_id);
    if (!order) {
      sendJson(response, 404, { error: "Order not found." });
      return;
    }
    if (order.invoiceId && event.id && order.invoiceId !== event.id) {
      sendJson(response, 409, { error: "Invoice reference does not match this order." });
      return;
    }
    if (event.currency && event.currency !== order.currency) {
      sendJson(response, 409, { error: "Invoice currency does not match this order." });
      return;
    }
    if (Number(event.amount) !== order.amount) {
      sendJson(response, 409, { error: "Invoice amount does not match this order." });
      return;
    }

    if (order.status === "PAID") {
      sendJson(response, 200, { received: true });
      return;
    }
    if (event.status === "PAID") order.status = "PAID";
    else if (event.status === "EXPIRED") order.status = "EXPIRED";
    else if (event.status === "PENDING") order.status = "PENDING";
    order.updatedAt = new Date().toISOString();
    await persistOrders();
    sendJson(response, 200, { received: true });
  }

  async function getOrderStatus(response, orderId) {
    const order = orders.get(orderId);
    if (!order) {
      sendJson(response, 404, { error: "Order not found." });
      return;
    }
    sendJson(response, 200, {
      orderId: order.orderId,
      status: order.status,
      amount: order.amount,
      currency: order.currency,
      expiresAt: order.expiresAt || null,
    });
  }

  return http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, "http://localhost");
      if (url.pathname === "/api/health") {
        sendJson(response, 200, { ok: true, xenditConfigured: Boolean(apiKey), webhookConfigured: Boolean(callbackToken) });
        return;
      }
      if (url.pathname === "/api/checkout") {
        await createInvoice(request, response);
        return;
      }
      if (url.pathname === "/api/xendit/webhook") {
        await receiveWebhook(request, response);
        return;
      }
      const orderMatch = url.pathname.match(/^\/api\/orders\/(ZSC-[0-9a-f-]{36})$/i);
      if (orderMatch && request.method === "GET") {
        await getOrderStatus(response, orderMatch[1]);
        return;
      }
      if (url.pathname.startsWith("/api/")) {
        sendJson(response, 404, { error: "API route not found." });
        return;
      }
      await serveStatic(request, response, url.pathname);
    } catch (error) {
      if (response.headersSent) {
        response.destroy();
        return;
      }
      sendJson(response, error.statusCode || 500, { error: error.statusCode ? error.message : "Unexpected server error." });
    }
  });
}

function loadLocalEnv() {
  const envFile = path.join(__dirname, ".env");
  if (!fs.existsSync(envFile)) return;
  for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match || match[1] in process.env) continue;
    const value = match[2].replace(/^(?:"([\s\S]*)"|'([\s\S]*)')$/, (_, doubleQuoted, singleQuoted) => doubleQuoted ?? singleQuoted);
    process.env[match[1]] = value;
  }
}

if (require.main === module) {
  loadLocalEnv();
  const port = Number(process.env.PORT || 3000);
  const host = process.env.HOST || (process.env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1");
  const server = createServer();
  server.listen(port, host, () => {
    console.log(`ZSCMMR server listening on http://localhost:${port}`);
    if (!process.env.XENDIT_API_KEY) console.log("Checkout is disabled until XENDIT_API_KEY is set in .env.");
    if (!process.env.XENDIT_CALLBACK_TOKEN) console.log("Xendit webhook is disabled until XENDIT_CALLBACK_TOKEN is set in .env.");
  });
}

module.exports = { createServer, validateCheckout };
