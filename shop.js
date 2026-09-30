(() => {
  const products = {
    "essential-series": { name: "Essential Series", price: 1920000 },
    "nocturne-bag": { name: "Nocturne Bag", price: 2880000 },
    "street-utility": { name: "Street Utility", price: 2320000 },
    "after-dark": { name: "After Dark", price: 3360000 },
    "shadow-edition": { name: "Shadow Edition", price: 2640000 },
    "archive-drop": { name: "Archive Drop", price: 3120000 },
  };
  const cartStorageKey = "zscmmr-cart-v1";
  const currency = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });

  function readCart() {
    try {
      const savedCart = JSON.parse(localStorage.getItem(cartStorageKey) || "[]");
      if (!Array.isArray(savedCart)) return [];
      return savedCart.filter((item) => products[item.id] && Number.isInteger(item.quantity) && item.quantity > 0);
    } catch {
      return [];
    }
  }

  let cart = readCart();
  const navbar = document.querySelector(".navbar");
  const cartTrigger = document.createElement("button");
  cartTrigger.className = "cart-trigger";
  cartTrigger.type = "button";
  cartTrigger.setAttribute("aria-label", "Open shopping bag");
  cartTrigger.innerHTML = '<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M3 7h14l-1 10H4L3 7Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M7 7V5a3 3 0 0 1 6 0v2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg><span class="cart-count">0</span>';
  navbar?.insertBefore(cartTrigger, navbar.querySelector(".navbar-logo"));

  document.querySelectorAll(".product-card").forEach((card) => {
    const productLink = card.querySelector('a[href*="product.html?product="]');
    const productId = productLink && new URL(productLink.href).searchParams.get("product");
    const product = products[productId];
    const productInfo = card.querySelector(".product-info");
    if (!product || !productInfo) return;

    const detailsLink = productInfo.querySelector(".product-action, .product-link");
    if (!detailsLink) return;

    const addButton = createAddButton(productId, product.name);
    const actions = document.createElement("div");
    actions.className = "product-card-actions";
    detailsLink.replaceWith(actions);
    actions.append(detailsLink, addButton);
  });

  const detailActions = document.querySelector(".product-details .actions");
  if (detailActions) {
    const productId = new URLSearchParams(window.location.search).get("product");
    if (products[productId]) detailActions.prepend(createAddButton(productId, products[productId].name));
  }

  const dialog = document.createElement("dialog");
  dialog.className = "cart-dialog";
  dialog.setAttribute("aria-labelledby", "cart-title");
  dialog.innerHTML = `
    <div class="cart-panel">
      <header class="cart-header">
        <div><h2 id="cart-title">Your shopping bag</h2><p>Review your pieces before placing an order.</p></div>
        <button class="cart-close" type="button" aria-label="Close shopping bag">×</button>
      </header>
      <div class="cart-content">
        <div class="cart-lines"></div>
        <section class="cart-checkout-form" hidden aria-label="Checkout details">
          <h3>Delivery details</h3>
          <label>Name<input name="customer-name" autocomplete="name" required /></label>
          <label>WhatsApp number<input name="customer-phone" type="tel" autocomplete="tel" required /></label>
          <label>Delivery address<textarea name="customer-address" autocomplete="street-address" required></textarea></label>
          <label>Order note <span>(optional)</span><textarea name="customer-note"></textarea></label>
          <button class="cart-send-order" type="button">Pay securely with Xendit <span aria-hidden="true">→</span></button>
          <p class="cart-feedback" aria-live="polite"></p>
        </section>
      </div>
      <footer class="cart-footer">
        <div class="cart-subtotal"><span>Subtotal</span><span class="cart-total">Rp0</span></div>
        <p class="cart-shipping-note">Shipping is not included yet. Confirm delivery fees with ZSCMMR before paying.</p>
        <button class="cart-checkout-button" type="button" disabled>Continue to checkout</button>
      </footer>
    </div>`;
  document.body.append(dialog);

  const cartLines = dialog.querySelector(".cart-lines");
  const countBadge = cartTrigger.querySelector(".cart-count");
  const totalOutput = dialog.querySelector(".cart-total");
  const checkoutButton = dialog.querySelector(".cart-checkout-button");
  const checkoutForm = dialog.querySelector(".cart-checkout-form");

  function persistCart() {
    try {
      localStorage.setItem(cartStorageKey, JSON.stringify(cart));
    } catch {
      dialog.querySelector(".cart-feedback").textContent = "Your browser could not save this bag. Keep this page open while ordering.";
    }
    renderCart();
  }

  function createAddButton(productId, productName) {
    const button = document.createElement("button");
    button.className = "add-to-cart";
    button.type = "button";
    button.dataset.addProduct = productId;
    button.setAttribute("aria-label", `Add ${productName} to shopping bag`);
    button.innerHTML = '<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M10 4v12M4 10h12" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg><span>Add to bag</span>';
    return button;
  }

  function renderCart() {
    cartLines.replaceChildren();
    const itemCount = cart.reduce((total, item) => total + item.quantity, 0);
    const subtotal = cart.reduce((total, item) => total + products[item.id].price * item.quantity, 0);
    countBadge.textContent = String(itemCount);
    cartTrigger.setAttribute("aria-label", `Open shopping bag, ${itemCount} ${itemCount === 1 ? "item" : "items"}`);
    totalOutput.textContent = currency.format(subtotal);
    checkoutButton.disabled = cart.length === 0;

    if (cart.length === 0) {
      const empty = document.createElement("p");
      empty.className = "cart-empty";
      empty.innerHTML = "<strong>Your bag is empty.</strong>Add a piece from the collection to get started.";
      cartLines.append(empty);
      checkoutForm.hidden = true;
      return;
    }

    cart.forEach((item) => {
      const product = products[item.id];
      const line = document.createElement("article");
      line.className = "cart-line";

      const image = document.createElement("img");
      image.src = "produk.jpg";
      image.alt = product.name;

      const info = document.createElement("div");
      const name = document.createElement("h3");
      name.className = "cart-line-name";
      name.textContent = product.name;
      const price = document.createElement("span");
      price.className = "cart-line-price";
      price.textContent = currency.format(product.price * item.quantity);
      const controls = document.createElement("div");
      controls.className = "cart-line-controls";
      controls.append(
        createQuantityButton("decrease", item.id, "Decrease quantity"),
        Object.assign(document.createElement("span"), { className: "cart-quantity", textContent: String(item.quantity) }),
        createQuantityButton("increase", item.id, "Increase quantity"),
      );
      info.append(name, price, controls);

      const removeButton = document.createElement("button");
      removeButton.className = "cart-remove";
      removeButton.type = "button";
      removeButton.dataset.removeProduct = item.id;
      removeButton.setAttribute("aria-label", `Remove ${product.name} from bag`);
      removeButton.textContent = "×";
      line.append(image, info, removeButton);
      cartLines.append(line);
    });
  }

  function createQuantityButton(action, productId, label) {
    const button = document.createElement("button");
    button.className = "cart-quantity-button";
    button.type = "button";
    button.dataset[action === "increase" ? "increaseProduct" : "decreaseProduct"] = productId;
    button.setAttribute("aria-label", label);
    button.textContent = action === "increase" ? "+" : "−";
    return button;
  }

  document.addEventListener("click", (event) => {
    const addButton = event.target.closest("[data-add-product]");
    if (!addButton) return;
    const existingItem = cart.find((item) => item.id === addButton.dataset.addProduct);
    if (existingItem) existingItem.quantity += 1;
    else cart.push({ id: addButton.dataset.addProduct, quantity: 1 });
    persistCart();
    addButton.querySelector("span").textContent = "Added";
    window.setTimeout(() => {
      const label = addButton.querySelector("span");
      if (label?.isConnected) label.textContent = "Add to bag";
    }, 1200);
  });

  cartLines.addEventListener("click", (event) => {
    const removeButton = event.target.closest("[data-remove-product]");
    const increaseButton = event.target.closest("[data-increase-product]");
    const decreaseButton = event.target.closest("[data-decrease-product]");
    if (removeButton) cart = cart.filter((item) => item.id !== removeButton.dataset.removeProduct);
    if (increaseButton) cart.find((item) => item.id === increaseButton.dataset.increaseProduct).quantity += 1;
    if (decreaseButton) {
      const item = cart.find((entry) => entry.id === decreaseButton.dataset.decreaseProduct);
      if (item.quantity > 1) item.quantity -= 1;
    }
    if (removeButton || increaseButton || decreaseButton) persistCart();
  });

  cartTrigger.addEventListener("click", () => dialog.showModal());
  dialog.querySelector(".cart-close").addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
  checkoutButton.addEventListener("click", () => {
    checkoutForm.hidden = false;
    checkoutForm.querySelector('[name="customer-name"]').focus();
    checkoutForm.scrollIntoView({ behavior: "smooth", block: "nearest" });
  });
  dialog.querySelector(".cart-send-order").addEventListener("click", async (event) => {
    const name = checkoutForm.querySelector('[name="customer-name"]');
    const phone = checkoutForm.querySelector('[name="customer-phone"]');
    const address = checkoutForm.querySelector('[name="customer-address"]');
    const note = checkoutForm.querySelector('[name="customer-note"]');
    const feedback = checkoutForm.querySelector(".cart-feedback");
    const payButton = event.currentTarget;
    if (!name.value.trim() || !phone.value.trim() || !address.value.trim()) {
      [name, phone, address].find((field) => !field.value.trim()).focus();
      feedback.textContent = "Please complete your name, WhatsApp number, and delivery address.";
      return;
    }

    payButton.disabled = true;
    feedback.textContent = "Creating your secure payment invoice...";

    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: cart,
          customer: {
            name: name.value.trim(),
            phone: phone.value.trim(),
            address: address.value.trim(),
            note: note.value.trim(),
          },
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not create a payment invoice.");
      if (!result.invoiceUrl) throw new Error("The payment provider did not return a checkout link.");
      window.location.assign(result.invoiceUrl);
    } catch (error) {
      feedback.textContent = error.message || "Could not start checkout. Please try again.";
      payButton.disabled = false;
    }
  });

  renderCart();

  const paymentReturn = new URLSearchParams(window.location.search);
  const returnedOrderId = paymentReturn.get("order");
  if (returnedOrderId) {
    const statusNotice = document.createElement("p");
    statusNotice.className = "payment-return";
    statusNotice.setAttribute("role", "status");
    statusNotice.textContent = paymentReturn.get("payment") === "failed"
      ? "Pembayaran belum selesai. Keranjang Anda masih tersimpan."
      : "Memeriksa status pembayaran...";
    document.body.prepend(statusNotice);

    if (paymentReturn.get("payment") !== "failed") {
      let attempts = 0;
      const checkPaymentStatus = async () => {
        try {
          const response = await fetch(`/api/orders/${encodeURIComponent(returnedOrderId)}`);
          if (response.ok) {
            const order = await response.json();
            if (order.status === "PAID") {
              statusNotice.textContent = `Pembayaran berhasil diterima. Nomor pesanan: ${order.orderId}`;
              cart = [];
              localStorage.removeItem(cartStorageKey);
              renderCart();
              return;
            }
            if (["EXPIRED", "CREATE_FAILED"].includes(order.status)) {
              statusNotice.textContent = "Pembayaran kedaluwarsa atau tidak berhasil. Silakan coba checkout kembali.";
              return;
            }
          }
        } catch {
          statusNotice.textContent = "Status pembayaran sedang diperbarui. Muat ulang halaman sebentar lagi.";
          return;
        }

        attempts += 1;
        if (attempts < 15) window.setTimeout(checkPaymentStatus, 2000);
        else statusNotice.textContent = "Pembayaran sedang diverifikasi. Hubungi ZSCMMR jika status belum berubah.";
      };
      checkPaymentStatus();
    }
  }
})();
