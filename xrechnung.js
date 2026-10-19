// XRechnung 3.0 (CII) generator. Runs in the browser and in Node (for validation tests).
(function (root) {
  "use strict";

  const GUIDELINE = "urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0";
  const PROCESS = "urn:fdc:peppol.eu:2017:poacc:billing:01:1.0";
  const KLEINUNTERNEHMER_TEXT = "Gemäß § 19 UStG wird keine Umsatzsteuer berechnet (Kleinunternehmerregelung).";
  // Zero-rated tax cases: category code, exemption reason, VATEX code and the note required on the invoice.
  const TAX_MODES = {
    AE: { reason: "Steuerschuldnerschaft des Leistungsempfängers", code: "VATEX-EU-AE",
      note: "Steuerschuldnerschaft des Leistungsempfängers (Reverse Charge, § 13b UStG / Art. 196 MwStSystRL)." },
    K: { reason: "Innergemeinschaftliche Lieferung", code: "VATEX-EU-IC",
      note: "Steuerfreie innergemeinschaftliche Lieferung (§ 4 Nr. 1b i. V. m. § 6a UStG)." },
  };

  function taxNote(invoice) {
    if (invoice.seller && invoice.seller.kleinunternehmer) return KLEINUNTERNEHMER_TEXT;
    return TAX_MODES[invoice.taxMode] ? TAX_MODES[invoice.taxMode].note : "";
  }

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
  }

  function round2(n) {
    return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
  }

  function amount(n) {
    return round2(n).toFixed(2);
  }

  function price(n) {
    // Unit prices may carry up to 4 decimals; trim trailing zeros but keep at least 2.
    const s = (Math.round(Number(n) * 10000) / 10000).toFixed(4);
    return s.replace(/(\.\d\d\d?)0+$/, "$1").replace(/(\.\d\d)0$/, "$1");
  }

  function date102(iso) {
    return String(iso || "").replace(/-/g, "");
  }

  function tag(name, content, attrs) {
    if (content == null || content === "") return "";
    const a = attrs ? Object.entries(attrs).map(([k, v]) => ` ${k}="${esc(v)}"`).join("") : "";
    return `<${name}${a}>${content}</${name}>`;
  }

  function text(name, value, attrs) {
    if (value == null || String(value).trim() === "") return "";
    return tag(name, esc(String(value).trim()), attrs);
  }

  function dateTag(name, iso) {
    if (!iso) return "";
    return `<${name}><udt:DateTimeString format="102">${date102(iso)}</udt:DateTimeString></${name}>`;
  }

  function address(a) {
    return tag("ram:PostalTradeAddress",
      text("ram:PostcodeCode", a.zip) +
      text("ram:LineOne", a.street) +
      text("ram:LineTwo", a.street2) +
      text("ram:CityName", a.city) +
      text("ram:CountryID", (a.country || "DE").toUpperCase()));
  }

  // Splits lines into VAT groups and computes all totals (EN 16931 rounding rules).
  function computeTotals(invoice) {
    const kleinunternehmer = !!invoice.seller.kleinunternehmer;
    const zeroMode = !kleinunternehmer && TAX_MODES[invoice.taxMode] ? invoice.taxMode : "";
    const lines = invoice.lines.map((l, i) => {
      const qty = Number(l.quantity) || 0;
      const unitPrice = Number(l.unitPrice) || 0;
      const rate = (kleinunternehmer || zeroMode) ? 0 : Number(l.vatRate);
      const category = kleinunternehmer ? "E" : zeroMode || (rate === 0 ? "Z" : "S");
      return { ...l, id: String(i + 1), qty, unitPrice, rate, category, net: round2(qty * unitPrice) };
    });
    const groups = {};
    for (const l of lines) {
      const key = l.category + "|" + l.rate;
      groups[key] = groups[key] || { category: l.category, rate: l.rate, basis: 0 };
      groups[key].basis = round2(groups[key].basis + l.net);
    }
    const vat = Object.values(groups).map(g => ({ ...g, tax: round2(g.basis * g.rate / 100) }));
    const lineTotal = round2(lines.reduce((s, l) => s + l.net, 0));
    const taxTotal = round2(vat.reduce((s, g) => s + g.tax, 0));
    const grandTotal = round2(lineTotal + taxTotal);
    const prepaid = round2(Number(invoice.prepaid) || 0);
    return { lines, vat, lineTotal, taxTotal, grandTotal, prepaid, due: round2(grandTotal - prepaid), kleinunternehmer, zeroMode, noVat: kleinunternehmer || !!zeroMode };
  }

  function validate(invoice) {
    const errors = [];
    const s = invoice.seller || {}, b = invoice.buyer || {};
    const need = (cond, msg) => { if (!cond) errors.push(msg); };
    need(invoice.number, "Rechnungsnummer fehlt");
    need(invoice.issueDate, "Rechnungsdatum fehlt");
    need(s.name, "Name des Verkäufers fehlt");
    need(s.street && s.zip && s.city, "Adresse des Verkäufers unvollständig (Straße, PLZ, Ort)");
    need(s.contactName && s.phone && s.email, "Kontakt des Verkäufers unvollständig (Name, Telefon, E-Mail – Pflicht in XRechnung)");
    need(s.vatId || s.taxNumber, "USt-IdNr. oder Steuernummer des Verkäufers fehlt");
    need(s.iban, "IBAN fehlt (Zahlungsanweisung ist Pflicht in XRechnung)");
    need(b.name, "Name des Käufers fehlt");
    need(b.street && b.zip && b.city, "Adresse des Käufers unvollständig (Straße, PLZ, Ort)");
    need(b.email, "E-Mail des Käufers fehlt (elektronische Adresse ist Pflicht in XRechnung 3.0)");
    need(invoice.deliveryDate || (invoice.periodStart && invoice.periodEnd), "Leistungsdatum oder Leistungszeitraum angeben (§ 14 UStG)");
    need(invoice.dueDate || invoice.paymentTerms, "Fälligkeitsdatum oder Zahlungsbedingungen angeben");
    need(invoice.lines && invoice.lines.length, "Mindestens eine Position angeben");
    if (!s.kleinunternehmer && TAX_MODES[invoice.taxMode]) {
      need(s.vatId, "Für Reverse Charge / innergemeinschaftliche Lieferung ist deine USt-IdNr. Pflicht");
      need(b.vatId, "Für Reverse Charge / innergemeinschaftliche Lieferung ist die USt-IdNr. des Kunden Pflicht");
    }
    if (invoice.typeCode === "381") need(invoice.precedingInvoice, "Bei einer Rechnungskorrektur die ursprüngliche Rechnungsnummer angeben");
    (invoice.lines || []).forEach((l, i) => {
      need(l.name, `Position ${i + 1}: Bezeichnung fehlt`);
      need(Number(l.quantity) > 0, `Position ${i + 1}: Menge muss größer als 0 sein`);
    });
    if (s.iban && !/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(s.iban.replace(/\s/g, "").toUpperCase())) {
      errors.push("IBAN-Format ungültig");
    }
    return errors;
  }

  function buildXml(invoice) {
    const t = computeTotals(invoice);
    const s = invoice.seller, b = invoice.buyer;
    const cur = invoice.currency || "EUR";

    const notes = [];
    if (taxNote(invoice)) notes.push(taxNote(invoice));
    if (invoice.note) notes.push(invoice.note);

    const lineXml = t.lines.map(l =>
      "<ram:IncludedSupplyChainTradeLineItem>" +
        tag("ram:AssociatedDocumentLineDocument", text("ram:LineID", l.id)) +
        tag("ram:SpecifiedTradeProduct", text("ram:Name", l.name) + text("ram:Description", l.description)) +
        tag("ram:SpecifiedLineTradeAgreement",
          tag("ram:NetPriceProductTradePrice", tag("ram:ChargeAmount", price(l.unitPrice)))) +
        tag("ram:SpecifiedLineTradeDelivery",
          tag("ram:BilledQuantity", String(l.qty), { unitCode: l.unit || "C62" })) +
        tag("ram:SpecifiedLineTradeSettlement",
          tag("ram:ApplicableTradeTax",
            "<ram:TypeCode>VAT</ram:TypeCode>" +
            text("ram:CategoryCode", l.category) +
            tag("ram:RateApplicablePercent", String(l.rate))) +
          tag("ram:SpecifiedTradeSettlementLineMonetarySummation", tag("ram:LineTotalAmount", amount(l.net)))) +
      "</ram:IncludedSupplyChainTradeLineItem>").join("");

    const taxRegs =
      (s.vatId ? tag("ram:SpecifiedTaxRegistration", text("ram:ID", s.vatId.replace(/\s/g, ""), { schemeID: "VA" })) : "") +
      (s.taxNumber ? tag("ram:SpecifiedTaxRegistration", text("ram:ID", s.taxNumber, { schemeID: "FC" })) : "");

    // BR-CO-26: without a VAT ID the seller needs another identifier (BT-29); the tax number serves.
    const sellerId = s.sellerId || (!s.vatId ? s.taxNumber : "");
    const seller = tag("ram:SellerTradeParty",
      text("ram:ID", sellerId) +
      text("ram:Name", s.name) +
      tag("ram:DefinedTradeContact",
        text("ram:PersonName", s.contactName) +
        tag("ram:TelephoneUniversalCommunication", text("ram:CompleteNumber", s.phone)) +
        tag("ram:EmailURIUniversalCommunication", text("ram:URIID", s.email))) +
      address(s) +
      tag("ram:URIUniversalCommunication", text("ram:URIID", s.email, { schemeID: "EM" })) +
      taxRegs);

    const buyer = tag("ram:BuyerTradeParty",
      text("ram:Name", b.name) +
      address(b) +
      tag("ram:URIUniversalCommunication", text("ram:URIID", b.email, { schemeID: "EM" })) +
      (b.vatId ? tag("ram:SpecifiedTaxRegistration", text("ram:ID", b.vatId.replace(/\s/g, ""), { schemeID: "VA" })) : ""));

    const agreement = tag("ram:ApplicableHeaderTradeAgreement",
      text("ram:BuyerReference", invoice.buyerReference || b.leitwegId || invoice.number) +
      seller + buyer +
      (invoice.orderRef ? tag("ram:BuyerOrderReferencedDocument", text("ram:IssuerAssignedID", invoice.orderRef)) : ""));

    const shipTo = t.zeroMode === "K"
      ? tag("ram:ShipToTradeParty", text("ram:Name", b.name) + address(b)) : "";
    const delivery = tag("ram:ApplicableHeaderTradeDelivery", shipTo +
      (invoice.deliveryDate ? tag("ram:ActualDeliverySupplyChainEvent", dateTag("ram:OccurrenceDateTime", invoice.deliveryDate)) : "")) ||
      "<ram:ApplicableHeaderTradeDelivery/>";

    const paymentMeans = tag("ram:SpecifiedTradeSettlementPaymentMeans",
      "<ram:TypeCode>58</ram:TypeCode>" +
      tag("ram:PayeePartyCreditorFinancialAccount",
        text("ram:IBANID", (s.iban || "").replace(/\s/g, "").toUpperCase()) +
        text("ram:AccountName", s.accountName || s.name)) +
      (s.bic ? tag("ram:PayeeSpecifiedCreditorFinancialInstitution", text("ram:BICID", s.bic.replace(/\s/g, "").toUpperCase())) : ""));

    const taxXml = t.vat.map(g =>
      tag("ram:ApplicableTradeTax",
        tag("ram:CalculatedAmount", amount(g.tax)) +
        "<ram:TypeCode>VAT</ram:TypeCode>" +
        (g.category === "E" ? text("ram:ExemptionReason", "Kleinunternehmer gemäß § 19 UStG") : "") +
        (TAX_MODES[g.category] ? text("ram:ExemptionReason", TAX_MODES[g.category].reason) : "") +
        tag("ram:BasisAmount", amount(g.basis)) +
        text("ram:CategoryCode", g.category) +
        (TAX_MODES[g.category] ? text("ram:ExemptionReasonCode", TAX_MODES[g.category].code) : "") +
        tag("ram:RateApplicablePercent", String(g.rate)))).join("");

    const period = (invoice.periodStart && invoice.periodEnd)
      ? tag("ram:BillingSpecifiedPeriod",
          dateTag("ram:StartDateTime", invoice.periodStart) + dateTag("ram:EndDateTime", invoice.periodEnd))
      : "";

    const terms = tag("ram:SpecifiedTradePaymentTerms",
      text("ram:Description", invoice.paymentTerms) + dateTag("ram:DueDateDateTime", invoice.dueDate));

    const sums = tag("ram:SpecifiedTradeSettlementHeaderMonetarySummation",
      tag("ram:LineTotalAmount", amount(t.lineTotal)) +
      tag("ram:TaxBasisTotalAmount", amount(t.lineTotal)) +
      tag("ram:TaxTotalAmount", amount(t.taxTotal), { currencyID: cur }) +
      tag("ram:GrandTotalAmount", amount(t.grandTotal)) +
      (t.prepaid ? tag("ram:TotalPrepaidAmount", amount(t.prepaid)) : "") +
      tag("ram:DuePayableAmount", amount(t.due)));

    const settlement = tag("ram:ApplicableHeaderTradeSettlement",
      text("ram:PaymentReference", invoice.number) +
      text("ram:InvoiceCurrencyCode", cur) +
      paymentMeans + taxXml + period + terms + sums +
      (invoice.precedingInvoice ? tag("ram:InvoiceReferencedDocument",
        text("ram:IssuerAssignedID", invoice.precedingInvoice) +
        (invoice.precedingInvoiceDate ? `<ram:FormattedIssueDateTime><qdt:DateTimeString format="102">${date102(invoice.precedingInvoiceDate)}</qdt:DateTimeString></ram:FormattedIssueDateTime>` : "")) : ""));

    return '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<rsm:CrossIndustryInvoice xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100" ' +
      'xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100" ' +
      'xmlns:qdt="urn:un:unece:uncefact:data:standard:QualifiedDataType:100" ' +
      'xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">' +
      tag("rsm:ExchangedDocumentContext",
        tag("ram:BusinessProcessSpecifiedDocumentContextParameter", text("ram:ID", PROCESS)) +
        tag("ram:GuidelineSpecifiedDocumentContextParameter", text("ram:ID", GUIDELINE))) +
      tag("rsm:ExchangedDocument",
        text("ram:ID", invoice.number) +
        text("ram:TypeCode", invoice.typeCode || "380") +
        dateTag("ram:IssueDateTime", invoice.issueDate) +
        notes.map(n => tag("ram:IncludedNote", text("ram:Content", n))).join("")) +
      tag("rsm:SupplyChainTradeTransaction", lineXml + agreement + delivery + settlement) +
      "</rsm:CrossIndustryInvoice>\n";
  }

  const api = { buildXml, computeTotals, validate, taxNote, KLEINUNTERNEHMER_TEXT };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.XRechnung = api;
})(typeof window !== "undefined" ? window : globalThis);
