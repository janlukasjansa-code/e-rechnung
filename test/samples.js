const X = require("../xrechnung.js");
const fs = require("fs");
const seller = { name: "Max Muster Webdesign", street: "Hauptstr. 1", zip: "10115", city: "Berlin", country: "DE",
  contactName: "Max Muster", phone: "+49 30 123456", email: "max@example.com", taxNumber: "30/123/45678",
  iban: "DE02120300000000202051", bic: "BYLADEM1001" };
const buyer = { name: "Beispiel GmbH", street: "Marktplatz 5", zip: "80331", city: "München", country: "DE", email: "rechnung@beispiel.de" };
const base = { number: "RE-2026-001", issueDate: "2026-10-18", dueDate: "2026-11-01", deliveryDate: "2026-10-15",
  paymentTerms: "Zahlbar innerhalb von 14 Tagen ohne Abzug.", buyer };
const cases = {
  kleinunternehmer: { ...base, seller: { ...seller, kleinunternehmer: true },
    lines: [{ name: "Webdesign Landingpage", quantity: 1, unit: "C62", unitPrice: 450 }, { name: "Beratung", quantity: 2.5, unit: "HUR", unitPrice: 60 }] },
  regelbesteuert: { ...base, number: "RE-2026-002", seller: { ...seller, vatId: "DE123456789" }, buyer: { ...buyer, vatId: "DE987654321" },
    periodStart: "2026-10-01", periodEnd: "2026-10-15", deliveryDate: undefined,
    lines: [{ name: "Programmierung", quantity: 10, unit: "HUR", unitPrice: 85.5 }, { name: "Fachbuch", quantity: 3, unit: "C62", unitPrice: 19.99, vatRate: 7 },
      { name: "Hosting", quantity: 1, unit: "MON", unitPrice: 9.9, vatRate: 19 }].map(l => ({ vatRate: 19, ...l })) },
  reverseCharge: { ...base, number: "RE-2026-003", taxMode: "AE", seller: { ...seller, vatId: "DE123456789" },
    buyer: { name: "Exemple SARL", street: "1 Rue de la Paix", zip: "75002", city: "Paris", country: "FR", email: "factures@exemple.fr", vatId: "FR40303265045" },
    lines: [{ name: "Softwareentwicklung", quantity: 12, unit: "HUR", unitPrice: 90, vatRate: 19 }] },
  innergemeinschaftlich: { ...base, number: "RE-2026-004", taxMode: "K", seller: { ...seller, vatId: "DE123456789" },
    buyer: { name: "Voorbeeld BV", street: "Damrak 1", zip: "1012 LG", city: "Amsterdam", country: "NL", email: "facturen@voorbeeld.nl", vatId: "NL859685149B01" },
    lines: [{ name: "Handgefertigte Lampe", quantity: 3, unit: "C62", unitPrice: 120, vatRate: 19 }] },
  korrektur: { ...base, number: "RE-2026-005", typeCode: "381", precedingInvoice: "RE-2026-002", precedingInvoiceDate: "2026-10-10",
    seller: { ...seller, vatId: "DE123456789" }, lines: [{ name: "Gutschrift Programmierung (2 Std. zu viel berechnet)", quantity: 2, unit: "HUR", unitPrice: 85.5, vatRate: 19 }] },
  behoerde: { ...base, number: "RE-2026-006", buyerReference: "991-12345-67", seller: { ...seller, kleinunternehmer: true },
    buyer: { name: "Stadtverwaltung Musterstadt", street: "Rathausplatz 1", zip: "12345", city: "Musterstadt", country: "DE", email: "erechnung@musterstadt.de" },
    lines: [{ name: "Fotodokumentation Stadtfest", quantity: 1, unit: "LS", unitPrice: 380 }] },
};
for (const [k, inv] of Object.entries(cases)) {
  const errs = X.validate(inv); if (errs.length) console.log(k, errs);
  fs.writeFileSync(`test/${k}.xml`, X.buildXml(inv));
  console.log(k, JSON.stringify(X.computeTotals(inv).vat));
}
