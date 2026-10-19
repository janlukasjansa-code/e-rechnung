(function () {
  "use strict";
  const form = document.getElementById("f");
  const linesEl = document.getElementById("lines");
  const STORE = "erechnung.v1";
  const UNITS = [["C62", "Stück"], ["HUR", "Stunde"], ["DAY", "Tag"], ["MON", "Monat"], ["LS", "Pauschale"], ["KMT", "km"]];
  const eur = n => n.toLocaleString("de-DE", { style: "currency", currency: "EUR" });
  const today = () => new Date().toISOString().slice(0, 10);
  const plusDays = (iso, d) => { const t = new Date(iso); t.setDate(t.getDate() + d); return t.toISOString().slice(0, 10); };

  function storage(fn) { try { return fn(window.localStorage); } catch (e) { return null; } }

  function addLine(l) {
    l = l || { name: "", quantity: 1, unit: "C62", unitPrice: "", vatRate: 19 };
    const tr = document.createElement("tr");
    tr.innerHTML =
      `<td><input data-k="name" placeholder="Leistung oder Artikel"></td>` +
      `<td><input data-k="quantity" type="number" step="any" min="0"></td>` +
      `<td><select data-k="unit">${UNITS.map(([c, n]) => `<option value="${c}">${n}</option>`).join("")}</select></td>` +
      `<td><input data-k="unitPrice" type="number" step="0.01"></td>` +
      `<td class="vatcol"><select data-k="vatRate"><option value="19">19 %</option><option value="7">7 %</option><option value="0">0 %</option></select></td>` +
      `<td class="num" data-sum></td>` +
      `<td><button type="button" class="link" title="Entfernen">✕</button></td>`;
    for (const el of tr.querySelectorAll("[data-k]")) el.value = l[el.dataset.k] ?? "";
    tr.querySelector("button").onclick = () => { tr.remove(); update(); };
    linesEl.appendChild(tr);
  }

  function read() {
    const inv = { seller: {}, buyer: {}, lines: [] };
    for (const el of form.elements) {
      if (!el.name) continue;
      const v = el.type === "checkbox" ? el.checked : el.value.trim();
      const [a, b] = el.name.split(".");
      if (b) inv[a][b] = v; else inv[a] = v;
    }
    for (const tr of linesEl.children) {
      const l = {};
      for (const el of tr.querySelectorAll("[data-k]")) l[el.dataset.k] = el.value.trim();
      if (l.name || l.unitPrice) inv.lines.push(l);
    }
    return inv;
  }

  function write(inv) {
    for (const el of form.elements) {
      if (!el.name) continue;
      const [a, b] = el.name.split(".");
      const v = b ? (inv[a] || {})[b] : inv[a];
      if (v === undefined) continue;
      if (el.type === "checkbox") el.checked = !!v; else el.value = v;
    }
  }

  function update() {
    const inv = read();
    const t = XRechnung.computeTotals(inv);
    document.querySelectorAll(".vatcol").forEach(el => el.style.display = t.noVat ? "none" : "");
    [...linesEl.children].forEach(tr => {
      const q = parseFloat(tr.querySelector('[data-k="quantity"]').value) || 0;
      const p = parseFloat(tr.querySelector('[data-k="unitPrice"]').value) || 0;
      tr.querySelector("[data-sum]").textContent = eur(Math.round(q * p * 100) / 100);
    });
    let html = `<div><span>Summe netto</span><span>${eur(t.lineTotal)}</span></div>`;
    for (const g of t.vat) if ((g.category === "S" || g.category === "Z")) html += `<div><span>USt ${g.rate} % auf ${eur(g.basis)}</span><span>${eur(g.tax)}</span></div>`;
    html += `<div class="grand"><span>Gesamt</span><span>${eur(t.grandTotal)}</span></div>`;
    if (XRechnung.taxNote(inv)) html += `<div style="font-size:.8rem;color:var(--muted)">${XRechnung.taxNote(inv)}</div>`;
    document.getElementById("taxModeLabel").style.display = inv.seller.kleinunternehmer ? "none" : "";
    document.getElementById("precedingFields").style.display = inv.typeCode === "381" ? "contents" : "none";
    document.getElementById("totals").innerHTML = html;
    if (document.getElementById("remember").checked) {
      storage(s => s.setItem(STORE, JSON.stringify({ seller: inv.seller, paymentTerms: inv.paymentTerms, number: inv.number })));
    }
  }

  function message(list, ok) {
    const box = document.getElementById("messages");
    box.innerHTML = ok ? `<p class="ok">${ok}</p>` : "<ul>" + list.map(m => `<li class="err">${m}</li>`).join("") + "</ul>";
  }

  function checked() {
    const inv = read();
    const errors = XRechnung.validate(inv);
    if (errors.length) { message(errors); return null; }
    return inv;
  }

  function download(name, content, type) {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const a = Object.assign(document.createElement("a"), { href: url, download: name });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function esc(s) { return String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
  const de = iso => iso ? iso.split("-").reverse().join(".") : "";

  function renderPrint(inv) {
    const t = XRechnung.computeTotals(inv);
    const s = inv.seller, b = inv.buyer;
    const unitName = c => (UNITS.find(u => u[0] === c) || [c, c])[1];
    document.getElementById("print").innerHTML = `
      <p style="font-size:9pt;color:#555">${esc(s.name)} · ${esc(s.street)} · ${esc(s.zip)} ${esc(s.city)}</p>
      <p>${esc(b.name)}<br>${esc(b.street)}<br>${esc(b.zip)} ${esc(b.city)}</p>
      <h2 style="margin-top:14mm">${inv.typeCode === "381" ? "Rechnungskorrektur" : "Rechnung"} ${esc(inv.number)}</h2>${inv.precedingInvoice ? `<p>Bezug: Rechnung ${esc(inv.precedingInvoice)}${inv.precedingInvoiceDate ? " vom " + de(inv.precedingInvoiceDate) : ""}</p>` : ""}${b.vatId ? `<p>USt-IdNr. Kunde: ${esc(b.vatId)}</p>` : ""}
      <p>Rechnungsdatum: ${de(inv.issueDate)}${inv.deliveryDate ? " · Leistungsdatum: " + de(inv.deliveryDate) : ""}${inv.orderRef ? " · Bestellnr.: " + esc(inv.orderRef) : ""}</p>
      <table><thead><tr><th>Pos.</th><th>Bezeichnung</th><th class="r">Menge</th><th class="r">Einzelpreis</th>${t.noVat ? "" : '<th class="r">USt</th>'}<th class="r">Summe</th></tr></thead><tbody>
      ${t.lines.map(l => `<tr><td>${l.id}</td><td>${esc(l.name)}</td><td class="r">${l.qty.toLocaleString("de-DE")} ${esc(unitName(l.unit))}</td><td class="r">${eur(l.unitPrice)}</td>${t.noVat ? "" : `<td class="r">${l.rate} %</td>`}<td class="r">${eur(l.net)}</td></tr>`).join("")}
      </tbody></table>
      <table style="width:auto;margin-left:auto;margin-top:6mm">
        <tr><td>Summe netto</td><td class="r">${eur(t.lineTotal)}</td></tr>
        ${t.vat.filter(g => (g.category === "S" || g.category === "Z")).map(g => `<tr><td>USt ${g.rate} %</td><td class="r">${eur(g.tax)}</td></tr>`).join("")}
        <tr><td><b>Gesamtbetrag</b></td><td class="r"><b>${eur(t.grandTotal)}</b></td></tr>
      </table>
      ${XRechnung.taxNote(inv) ? `<p>${XRechnung.taxNote(inv)}</p>` : ""}
      ${inv.note ? `<p>${esc(inv.note)}</p>` : ""}
      <p>${esc(inv.paymentTerms)}${inv.dueDate ? " Fällig am " + de(inv.dueDate) + "." : ""}<br>Bitte überweisen auf IBAN ${esc(s.iban)}${s.bic ? " (BIC " + esc(s.bic) + ")" : ""}, Verwendungszweck: ${esc(inv.number)}</p>
      <p style="font-size:9pt;color:#555;margin-top:12mm">${esc(s.name)} · ${esc(s.contactName)} · ${esc(s.email)} · ${esc(s.phone)}<br>
      ${s.taxNumber ? "Steuernummer: " + esc(s.taxNumber) : ""} ${s.vatId ? " · USt-IdNr.: " + esc(s.vatId) : ""}</p>`;
  }

  // Init
  const saved = storage(s => JSON.parse(s.getItem(STORE) || "null"));
  if (saved) write(saved);
  if (!form.elements.number.value) form.elements.number.value = new Date().getFullYear() + "-001";
  form.elements.issueDate.value = today();
  form.elements.deliveryDate.value = today();
  form.elements.dueDate.value = plusDays(today(), 14);
  addLine();
  form.addEventListener("input", update);
  document.getElementById("addLine").onclick = () => { addLine(); update(); };
  document.getElementById("dlXml").onclick = () => {
    const inv = checked(); if (!inv) return;
    download(`XRechnung_${inv.number.replace(/[^\w.-]+/g, "_")}.xml`, XRechnung.buildXml(inv), "application/xml");
    message([], "XRechnung erstellt. Tipp: zusätzlich die Druckansicht als PDF für den Kunden speichern.");
  };
  document.getElementById("printBtn").onclick = () => { const inv = checked(); if (!inv) return; renderPrint(inv); window.print(); };
  document.getElementById("nextNumber").onclick = () => {
    const n = form.elements.number;
    n.value = n.value.replace(/(\d+)(?!.*\d)/, d => String(Number(d) + 1).padStart(d.length, "0"));
    for (const k of ["buyer.name", "buyer.street", "buyer.zip", "buyer.city", "buyer.email", "buyer.vatId", "buyerReference", "orderRef", "note", "precedingInvoice", "precedingInvoiceDate"]) form.elements[k].value = "";
    linesEl.innerHTML = ""; addLine(); update(); message([], "");
  };
  update();
  window.App = { form, linesEl, read, write, update, addLine, checked, download, message };
})();
