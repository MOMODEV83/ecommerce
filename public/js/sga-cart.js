/*
 * Sky Garden Access — panier et commande sans WordPress.
 *
 * Le panier est gardé dans le navigateur (localStorage). Il remplace
 * l'AJAX WooCommerce : boutons « Ajouter au panier », tiroir panier,
 * page /panier/ et page /paiement/. La commande est envoyée sur WhatsApp.
 */
(function () {
  "use strict";

  var CONFIG = {
    whatsapp: "221772266857",
    shopName: "Sky Garden Accessoires",
    giftWrap: 1500,
    // Annoncé dans le bandeau du site : « Livraison gratuite dès 50 000 FCFA ».
    freeShippingFrom: 50000,
  };

  // Frais de livraison par lieu (relevés sur la boutique WooCommerce).
  var RATES = {};
  function tier(price, places) {
    places.forEach(function (p) { RATES[p] = price; });
  }
  tier(1000, ["Sacré-Cœur 1", "Sacré-Cœur 2", "Sacré-Cœur 3", "Mermoz", "Liberté 1", "Liberté 2", "Liberté 3", "Liberté 4", "Liberté 5", "Liberté 6", "Point E", "Baobab", "Grand Dakar", "Karack", "Jet d'Eau", "Zone B", "Cité Keur Gorgui", "Amitié 1", "Amitié 2", "Amitié 3", "Dieuppeul", "Derklé"]);
  tier(1500, ["HLM", "Colobane", "Fass", "Ouakam", "Ouest Foire", "Nord Foire", "Sud Foire", "Parcelles Assainies", "Patte d'Oie", "Maristes", "Hann", "Grand Yoff", "Scat Urbam", "Médina", "Zone de Captage", "Gueule Tapée", "Khar Yalla", "Bopp", "Castors", "Ouagou Niayes", "Biscuiterie", "Fann Résidence", "Fann Hock", "Fann", "Cité Mourtada 2", "Gibraltar", "Mamelles"]);
  tier(2000, ["Almadies", "Ngor", "Yoff", "Dakar-Plateau", "Cambérène", "Bel-Air", "Yarakh", "Reubeuss", "Pikine", "Guédiawaye", "Thiaroye", "Diamaguène", "Sicap Mbao", "Fass Mbao", "Petit Mbao", "Mbao", "Keur Mbaye Fall", "Grand Mbao", "ZAC Mbao", "Rufisque", "Keur Massar", "Malika", "Yeumbeul"]);
  tier(2500, ["APIX", "Tivaouane Peulh", "Niakoul Rap (Garage)", "Bargny (EDK)", "Keur Ndiaye Lô (Poste courant)", "Kounoune"]);
  tier(3000, ["Ndiakhirate (Croisement)", "Bambilor", "Lac Rose (Terminus 73)", "Diamniadio (Garage)", "Sébikotane", "Niague (Garage Clando)", "Sangalkam (Gendarmerie)"]);
  // Hors Dakar : envoi par Sénégal Dem Dikk, pas de paiement à la livraison.
  var OUTSIDE_DAKAR = ["Thiès", "Mbour", "Diourbel", "Touba", "Fatick", "Kaffrine", "Kaolack", "Kédougou", "Kolda", "Louga", "Matam", "Saint-Louis", "Sédhiou", "Tambacounda", "Ziguinchor", "Autre ville (hors Dakar)"];
  tier(3000, OUTSIDE_DAKAR);

  var KEY = "sga_cart_v1";
  var $ = window.jQuery;

  /* ---------- Stockage ---------- */

  function load() {
    try {
      var items = JSON.parse(localStorage.getItem(KEY) || "[]");
      return Array.isArray(items) ? items : [];
    } catch (e) {
      return [];
    }
  }
  var cart = load();

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(cart)); } catch (e) {}
    renderAll();
  }

  function subtotal() {
    return cart.reduce(function (s, i) { return s + i.price * i.qty; }, 0);
  }
  function count() {
    return cart.reduce(function (s, i) { return s + i.qty; }, 0);
  }

  function addItem(item) {
    var existing = cart.filter(function (i) { return i.key === item.key; })[0];
    if (existing) {
      existing.qty += item.qty;
      if (item.max) existing.qty = Math.min(existing.qty, item.max);
    } else {
      if (item.max) item.qty = Math.min(item.qty, item.max);
      cart.push(item);
    }
    save();
  }

  function setQty(key, qty) {
    cart = cart
      .map(function (i) {
        if (i.key !== key) return i;
        var q = Math.max(0, Math.floor(Number(qty) || 0));
        if (i.max) q = Math.min(q, i.max);
        return Object.assign({}, i, { qty: q });
      })
      .filter(function (i) { return i.qty > 0; });
    save();
  }

  /* ---------- Formatage ---------- */

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function fmt(n) {
    return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  }
  function money(n) {
    return '<span class="woocommerce-Price-amount amount"><bdi>' + fmt(n) +
      '&nbsp;<span class="woocommerce-Price-currencySymbol">CFA</span></bdi></span>';
  }
  function parsePrice(el) {
    if (!el) return 0;
    var bdi = el.querySelector("ins bdi") || el.querySelector("bdi") || el;
    return Number((bdi.textContent || "").replace(/[^\d]/g, "")) || 0;
  }
  function fullName(i) {
    return i.name + (i.variation ? " – " + i.variation : "");
  }

  /* ---------- Ajout au panier ---------- */

  function fromProductForm(form, button) {
    var productId = (form.querySelector('[name="product_id"]') || form.querySelector('[name="add-to-cart"]') || button || {}).value;
    var variationInput = form.querySelector('[name="variation_id"]');
    var variationId = variationInput ? Number(variationInput.value) : 0;
    var qtyInput = form.querySelector('[name="quantity"]');
    var qty = Math.max(1, Number(qtyInput && qtyInput.value) || 1);
    var summary = form.closest(".summary, .product") || document;
    var name = ((summary.querySelector(".product_title") || document.querySelector(".product_title") || {}).textContent || "").trim();

    var labels = [];
    form.querySelectorAll("table.variations select").forEach(function (s) {
      var opt = s.options[s.selectedIndex];
      if (opt && s.value) labels.push(opt.textContent.trim());
    });

    var price = parsePrice(summary.querySelector(".price"));
    var image = (document.querySelector(".woocommerce-product-gallery img, .cg-main-swiper img") || {}).src || "";
    var max = 0;

    var variations = [];
    try { variations = JSON.parse(form.getAttribute("data-product_variations") || "[]") || []; } catch (e) {}
    if (!variationId && variations.length) {
      // The hidden variation_id may not be filled yet: match the chosen attributes.
      var chosen = {};
      form.querySelectorAll("table.variations select").forEach(function (s) { chosen[s.name] = s.value; });
      var match = variations.filter(function (x) {
        return Object.keys(x.attributes || {}).every(function (k) {
          return !x.attributes[k] || x.attributes[k] === chosen[k];
        });
      })[0];
      if (match) variationId = match.variation_id;
    }

    if (variationId) {
      var v = variations.filter(function (x) { return x.variation_id === variationId; })[0];
      if (v) {
        price = v.display_price || price;
        if (v.image) image = v.image.thumb_src || v.image.src || image;
        max = Number(v.max_qty) || 0;
      }
    } else if (qtyInput && qtyInput.max) {
      max = Number(qtyInput.max) || 0;
    }

    return {
      key: productId + ":" + variationId,
      productId: Number(productId),
      variationId: variationId,
      name: name,
      variation: labels.join(", "),
      price: price,
      qty: qty,
      max: max,
      image: image,
      url: location.pathname,
    };
  }

  function fromLoopButton(btn) {
    var card = btn.closest("li.product, .product") || btn.parentNode;
    var title = card.querySelector(".woocommerce-loop-product__title, .woocommerce-loop-product__title a, h2, h3");
    var link = card.querySelector("a.woocommerce-LoopProduct-link");
    var img = card.querySelector("img");
    return {
      key: btn.getAttribute("data-product_id") + ":0",
      productId: Number(btn.getAttribute("data-product_id")),
      variationId: 0,
      name: (title ? title.textContent : btn.getAttribute("aria-label") || "").trim(),
      variation: "",
      price: parsePrice(card.querySelector(".price")),
      qty: Number(btn.getAttribute("data-quantity")) || 1,
      max: 0,
      image: img ? img.src : "",
      url: link ? link.getAttribute("href") : "",
    };
  }

  function openDrawer() {
    document.body.classList.add("drawer-open");
    var drawer = document.getElementById("shoptimizerCartDrawer");
    if (drawer) drawer.focus();
  }

  // Phase de capture : on passe avant les gestionnaires AJAX de WooCommerce.
  document.addEventListener("click", function (e) {
    var btn = e.target.closest && e.target.closest(".single_add_to_cart_button, a.ajax_add_to_cart");
    if (!btn) return;

    if (btn.matches(".single_add_to_cart_button")) {
      var form = btn.closest("form.cart");
      if (!form) return;
      // Options non choisies : WooCommerce affiche lui-même le message.
      if (btn.classList.contains("disabled")) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      addItem(fromProductForm(form, btn));
    } else {
      e.preventDefault();
      e.stopImmediatePropagation();
      addItem(fromLoopButton(btn));
    }
    openDrawer();
  }, true);

  document.addEventListener("submit", function (e) {
    if (e.target.matches && e.target.matches("form.cart")) e.preventDefault();
  }, true);

  /* ---------- Affichage : en-tête et tiroir ---------- */

  function renderHeader() {
    document.querySelectorAll(".shoptimizer-cart .count").forEach(function (el) { el.textContent = count(); });
    document.querySelectorAll(".shoptimizer-cart .cart-contents > .amount").forEach(function (el) { el.innerHTML = money(subtotal()); });
  }

  function renderDrawer() {
    var box = document.querySelector("#shoptimizerCartDrawer .widget_shopping_cart_content");
    if (!box) return;
    if (!cart.length) {
      box.innerHTML = '<p class="woocommerce-mini-cart__empty-message">Votre panier est vide.</p>' +
        '<p class="woocommerce-mini-cart__buttons buttons"><a href="/catalogue/" class="button wc-forward">Voir le catalogue</a></p>';
      return;
    }
    box.innerHTML =
      '<ul class="woocommerce-mini-cart cart_list product_list_widget">' +
      cart.map(function (i) {
        return '<li class="woocommerce-mini-cart-item mini_cart_item">' +
          '<a href="#" class="remove remove_from_cart_button sga-remove" data-key="' + esc(i.key) + '" aria-label="Retirer ' + esc(fullName(i)) + ' du panier">×</a>' +
          '<a href="' + esc(i.url) + '"><img width="300" height="330" src="' + esc(i.image) + '" alt="">' + esc(i.name) + "</a>" +
          (i.variation ? '<dl class="variation"><dd>' + esc(i.variation) + "</dd></dl>" : "") +
          '<span class="quantity">' + i.qty + " × " + money(i.price) + "</span></li>";
      }).join("") +
      "</ul>" +
      '<p class="woocommerce-mini-cart__total total"><strong>Sous-total :</strong> ' + money(subtotal()) + "</p>" +
      '<p class="woocommerce-mini-cart__buttons buttons"><a href="/panier/" class="button wc-forward">Voir le panier</a>' +
      '<a href="/paiement/" class="button checkout wc-forward">Commander</a></p>';
  }

  document.addEventListener("click", function (e) {
    var rm = e.target.closest && e.target.closest(".sga-remove");
    if (!rm) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    setQty(rm.getAttribute("data-key"), 0);
  }, true);

  /* ---------- Page /panier/ ---------- */

  function renderCartPage() {
    var root = document.getElementById("sga-cart");
    if (!root) return;
    if (!cart.length) {
      root.innerHTML =
        '<div class="wc-empty-cart-message"><div class="cart-empty woocommerce-info" role="status">Votre panier est actuellement vide.</div></div>' +
        '<p class="return-to-shop"><a class="button wc-backward" href="/catalogue/">Retour à la boutique</a></p>';
      return;
    }
    root.innerHTML =
      '<form class="woocommerce-cart-form" onsubmit="return false">' +
      '<table class="shop_table shop_table_responsive cart woocommerce-cart-form__contents" cellspacing="0"><thead><tr>' +
      '<th class="product-remove"><span class="screen-reader-text">Supprimer l’élément</span></th>' +
      '<th class="product-thumbnail"><span class="screen-reader-text">Miniature</span></th>' +
      '<th class="product-name">Produit</th><th class="product-price">Prix</th><th class="product-quantity">Quantité</th><th class="product-subtotal">Sous-total</th>' +
      "</tr></thead><tbody>" +
      cart.map(function (i) {
        return '<tr class="woocommerce-cart-form__cart-item cart_item">' +
          '<td class="product-remove"><a href="#" class="remove sga-remove" data-key="' + esc(i.key) + '" aria-label="Retirer ' + esc(fullName(i)) + ' du panier">×</a></td>' +
          '<td class="product-thumbnail"><a href="' + esc(i.url) + '"><img width="300" height="330" src="' + esc(i.image) + '" alt=""></a></td>' +
          '<td class="product-name" data-title="Produit"><a href="' + esc(i.url) + '">' + esc(fullName(i)) + "</a></td>" +
          '<td class="product-price" data-title="Prix">' + money(i.price) + "</td>" +
          '<td class="product-quantity" data-title="Quantité"><div class="quantity">' +
          '<input type="number" class="input-text qty text sga-qty" data-key="' + esc(i.key) + '" value="' + i.qty + '" min="0"' + (i.max ? ' max="' + i.max + '"' : "") + ' step="1" inputmode="numeric" aria-label="Quantité"></div></td>' +
          '<td class="product-subtotal" data-title="Sous-total">' + money(i.price * i.qty) + "</td></tr>";
      }).join("") +
      "</tbody></table></form>" +
      '<div class="cart-collaterals"><div class="cart_totals"><h2>Total panier</h2>' +
      '<table cellspacing="0" class="shop_table shop_table_responsive"><tbody>' +
      '<tr class="cart-subtotal"><th>Sous-total</th><td data-title="Sous-total">' + money(subtotal()) + "</td></tr>" +
      '<tr class="woocommerce-shipping-totals shipping"><th>Expédition</th><td data-title="Expédition">Calculée à l’étape suivante selon votre lieu de livraison.</td></tr>' +
      '<tr class="order-total"><th>Total</th><td data-title="Total"><strong>' + money(subtotal()) + "</strong></td></tr>" +
      "</tbody></table>" +
      '<div class="wc-proceed-to-checkout"><a href="/paiement/" class="checkout-button button alt wc-forward">Valider la commande</a></div>' +
      "</div></div>";
  }

  document.addEventListener("change", function (e) {
    if (e.target.classList && e.target.classList.contains("sga-qty")) setQty(e.target.getAttribute("data-key"), e.target.value);
  });

  /* ---------- Page /paiement/ ---------- */

  function checkoutState() {
    var loc = (document.getElementById("delivery_location") || {}).value || "";
    var gift = !!(document.getElementById("sg_gift_wrap") || {}).checked;
    var sub = subtotal();
    var shipping = loc ? (sub >= CONFIG.freeShippingFrom ? 0 : RATES[loc] || 0) : null;
    return {
      loc: loc,
      outside: OUTSIDE_DAKAR.indexOf(loc) !== -1,
      gift: gift,
      subtotal: sub,
      shipping: shipping,
      total: sub + (shipping || 0) + (gift ? CONFIG.giftWrap : 0),
    };
  }

  function renderCheckout() {
    var review = document.querySelector("#order_review .woocommerce-checkout-review-order-table");
    if (!review) return;
    var form = document.querySelector("form.woocommerce-checkout");
    var empty = document.getElementById("sga-checkout-empty");

    if (!cart.length && !document.body.classList.contains("sga-order-sent")) {
      if (form) form.style.display = "none";
      if (empty) empty.style.display = "";
      return;
    }
    if (form) form.style.display = "";
    if (empty) empty.style.display = "none";

    var s = checkoutState();
    review.querySelector("tbody").innerHTML = cart.map(function (i) {
      return '<tr class="cart_item"><td class="product-name">' +
        '<div class="product-item-thumbnail"><img width="150" height="200" src="' + esc(i.image) + '" class="skip-lazy" alt=""></div> ' +
        '<div class="cg-checkout-table-product-name">' + esc(fullName(i)) + '&nbsp; <strong class="product-quantity">×&nbsp;' + i.qty + '</strong><div class="clear"></div></div></td>' +
        '<td class="product-total">' + money(i.price * i.qty) + "</td></tr>";
    }).join("");

    var shippingText = s.shipping === null
      ? "Choisissez votre lieu de livraison"
      : s.shipping === 0 ? "Livraison gratuite" : "Livraison : " + money(s.shipping);
    review.querySelector("tfoot").innerHTML =
      '<tr class="cart-subtotal"><th>Sous-total</th><td>' + money(s.subtotal) + "</td></tr>" +
      '<tr class="woocommerce-shipping-totals shipping"><th>Expédition</th><td data-title="Expédition">' + shippingText + "</td></tr>" +
      (s.gift ? '<tr class="fee"><th>Emballage cadeau</th><td>' + money(CONFIG.giftWrap) + "</td></tr>" : "") +
      '<tr class="order-total"><th>Total</th><td><strong>' + money(s.total) + "</strong></td></tr>";

    // Hors Dakar : pas de paiement à la livraison.
    var cod = document.getElementById("payment_method_cod");
    var mobile = document.getElementById("payment_method_mobile");
    if (cod && mobile) {
      cod.disabled = s.outside;
      cod.closest("li").style.display = s.outside ? "none" : "";
      if (s.outside && cod.checked) mobile.checked = true;
      syncPaymentBoxes();
    }
  }

  function syncPaymentBoxes() {
    document.querySelectorAll("#payment .wc_payment_method").forEach(function (li) {
      var radio = li.querySelector("input[type=radio]");
      var box = li.querySelector(".payment_box");
      if (box) box.style.display = radio && radio.checked ? "" : "none";
    });
  }

  function fieldValue(id) {
    var el = document.getElementById(id);
    return el ? el.value.trim() : "";
  }

  function orderNumber() {
    var d = new Date();
    return "SGA-" + String(d.getFullYear()).slice(2) + String(d.getMonth() + 1).padStart(2, "0") +
      String(d.getDate()).padStart(2, "0") + "-" + Math.random().toString(36).slice(2, 6).toUpperCase();
  }

  function showErrors(errors) {
    var wrap = document.querySelector("form.woocommerce-checkout");
    var old = document.getElementById("sga-errors");
    if (old) old.remove();
    if (!errors.length) return;
    var ul = document.createElement("ul");
    ul.id = "sga-errors";
    ul.className = "woocommerce-error";
    ul.setAttribute("role", "alert");
    ul.innerHTML = errors.map(function (m) { return "<li>" + esc(m) + "</li>"; }).join("");
    wrap.parentNode.insertBefore(ul, wrap);
    ul.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function placeOrder(e) {
    e.preventDefault();
    if (!cart.length) return;
    var s = checkoutState();
    var first = fieldValue("billing_first_name");
    var last = fieldValue("billing_last_name");
    var phone = fieldValue("billing_phone");
    var email = fieldValue("billing_email");
    var landmark = fieldValue("billing_delivery_instructions");
    var notes = fieldValue("order_comments");
    var payment = (document.querySelector('#payment input[name="payment_method"]:checked') || {}).value;

    var errors = [];
    if (!first) errors.push("Le prénom est obligatoire.");
    if (!last) errors.push("Le nom est obligatoire.");
    if (!s.loc) errors.push("Le lieu de livraison est obligatoire.");
    if (!phone) errors.push("Le téléphone est obligatoire.");
    else if (phone.replace(/[^\d]/g, "").length < 9) errors.push("Le numéro de téléphone n’est pas valide.");
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push("L’adresse e-mail n’est pas valide.");
    if (!payment) errors.push("Choisissez un moyen de paiement.");
    showErrors(errors);
    if (errors.length) return;

    var number = orderNumber();
    var paymentLabel = payment === "cod" ? "à la livraison (espèces)" : "mobile (Wave / Orange Money), lien à envoyer";
    var lines = [
      "*Nouvelle commande " + number + "*",
      CONFIG.shopName,
      "",
    ];
    cart.forEach(function (i) {
      lines.push("• " + fullName(i) + " × " + i.qty + " : " + fmt(i.price * i.qty) + " CFA");
    });
    lines.push("", "Sous-total : " + fmt(s.subtotal) + " CFA");
    lines.push("Livraison (" + s.loc + ") : " + (s.shipping ? fmt(s.shipping) + " CFA" : "gratuite"));
    if (s.gift) lines.push("Emballage cadeau : " + fmt(CONFIG.giftWrap) + " CFA");
    lines.push("*Total : " + fmt(s.total) + " CFA*", "");
    lines.push("Paiement : " + paymentLabel);
    lines.push("Client : " + first + " " + last);
    lines.push("Téléphone : " + phone);
    if (email) lines.push("E-mail : " + email);
    lines.push("Lieu de livraison : " + s.loc + (s.outside ? " (Sénégal Dem Dikk)" : ""));
    if (landmark) lines.push("Repère : " + landmark);
    if (notes) lines.push("Notes : " + notes);

    var url = "https://wa.me/" + CONFIG.whatsapp + "?text=" + encodeURIComponent(lines.join("\n"));
    var win = window.open(url, "_blank");
    showConfirmation(number, s, url, !win);
    cart = [];
    save();
  }

  function showConfirmation(number, s, url, blocked) {
    document.body.classList.add("sga-order-sent");
    var form = document.querySelector("form.woocommerce-checkout");
    var box = document.createElement("div");
    box.className = "woocommerce-order sga-confirmation";
    box.innerHTML =
      '<p class="woocommerce-notice woocommerce-notice--success woocommerce-thankyou-order-received">Merci ! Votre commande a été préparée.</p>' +
      '<ul class="woocommerce-order-overview woocommerce-thankyou-order-details order_details">' +
      '<li class="woocommerce-order-overview__order order">Commande : <strong>' + esc(number) + "</strong></li>" +
      '<li class="woocommerce-order-overview__total total">Total : <strong>' + money(s.total) + "</strong></li>" +
      "</ul>" +
      "<p>" + (blocked
        ? "Pour finaliser, envoyez-nous le récapitulatif sur WhatsApp :"
        : "WhatsApp s’est ouvert avec le récapitulatif de votre commande : envoyez le message pour la confirmer. Si rien ne s’est ouvert :") + "</p>" +
      '<p><a class="button alt" target="_blank" rel="noopener" href="' + esc(url) + '">Envoyer la commande sur WhatsApp</a></p>' +
      '<p><a href="/catalogue/">Continuer mes achats</a></p>';
    form.parentNode.replaceChild(box, form);
    var steps = document.querySelectorAll(".checkout-bar li");
    steps.forEach(function (li, i) { li.classList.toggle("active", i === 2); li.classList.remove("next"); });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function initCheckout() {
    var form = document.querySelector("form.woocommerce-checkout");
    if (!form) return;
    form.addEventListener("submit", placeOrder, true);
    document.addEventListener("change", function (e) {
      if (e.target.id === "sg_gift_wrap") renderCheckout();
      if (e.target.name === "payment_method") syncPaymentBoxes();
    });
    // Le lieu est une liste selectWoo : ses changements passent par jQuery.
    if ($) $(document.body).on("change", "#delivery_location", renderCheckout);
    else document.addEventListener("change", function (e) { if (e.target.id === "delivery_location") renderCheckout(); });
  }

  /* ---------- Démarrage ---------- */

  function renderAll() {
    renderHeader();
    renderDrawer();
    renderCartPage();
    renderCheckout();
  }

  // Panier modifié dans un autre onglet.
  window.addEventListener("storage", function (e) {
    if (e.key === KEY) { cart = load(); renderAll(); }
  });

  initCheckout();
  renderAll();
})();
