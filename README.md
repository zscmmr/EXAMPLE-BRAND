# ZSCMMR local checkout backend

Node.js serves the static storefront and creates Xendit IDR invoices. The API key is read only by the server from `.env`; it is never sent to browser code.

## Local setup

1. Install Node.js 18 or newer.
2. Copy `.env.example` to `.env`.
3. In the Xendit dashboard, create a test API secret key and callback verification token. Put them in `.env` as `XENDIT_API_KEY` and `XENDIT_CALLBACK_TOKEN`. Never commit or share `.env`.
4. Keep `APP_BASE_URL=http://localhost:3000` for local checkout redirects.
5. Run `npm start`, then open `http://localhost:3000` (do not open `index.html` as a `file://` URL).
6. Run `npm test` to exercise invoice creation and webhook handling with a mocked Xendit API.

Without `XENDIT_API_KEY`, the storefront and health endpoint still run, but checkout intentionally returns a configuration error. No real payment is created by the automated tests.

## Xendit dashboard

In the Xendit test dashboard, configure the Invoice callback URL as:

`https://YOUR-PUBLIC-HTTPS-HOST/api/xendit/webhook`

Set the callback verification token to the exact value of `XENDIT_CALLBACK_TOKEN`. For local webhook testing, expose the local server through a temporary HTTPS tunnel and use that public URL. Do not use the live secret key during local development.

The invoice return URLs use `APP_BASE_URL`. In production this must be the public HTTPS origin of the hosted site. Xendit callbacks update order status after checking the callback token, invoice ID, amount, and currency.

## Current checkout scope and launch checklist

- Product prices are configured server-side in `server.js`, in IDR. The current values are temporary conversions; confirm actual selling prices before taking live orders.
- Shipping is not calculated or added to the invoice. Confirm how shipping will be charged before enabling live sales.
- Customer order details and invoice status are stored in `data/orders.json` locally. This prototype has no staff/admin order dashboard, database backups, automated retention, or production access controls. Use a managed database and add access controls/retention before production.
- Configure the production domain, HTTPS, live Xendit credentials, and the production callback URL only after sandbox checkout and callback tests pass.
