import { Button } from "@/components/ui/button";
import { useEffect, useMemo, useState } from "react";
import JsBarcode from "jsbarcode";
import { Printer } from "lucide-react";
import type { Booking, InventoryBatch, Pallet } from "@shared/api";

interface DeliverySheetProps {
  order: Booking;
  pallets: Pallet[];
  batches: InventoryBatch[];
  onClose: () => void;
}

interface PickLine {
  key: string;
  productName: string;
  batchName: string;
  qty: number;
}

function barcodeDataUrl(value: string) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  JsBarcode(svg, value, { format: "CODE128", displayValue: false, margin: 20, height: 64, width: 2 });
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(svg))}`;
}

export function DeliverySheet({ order, pallets, batches, onClose }: DeliverySheetProps) {
  const [barcodes, setBarcodes] = useState<Record<string, string>>({});
  const orderBarcode = useMemo(() => barcodeDataUrl(order.id), [order.id]);
  const [cardMode, setCardMode] = useState(true);

  const pickLines = useMemo<PickLine[]>(() => {
    const batchNameByItemId = new Map(
      batches.flatMap((batch) => (batch.items ?? []).map((item) => [item.id, batch.name] as const)),
    );
    const productNameById = new Map(
      (order.booking_items ?? []).map((item) => [item.product_id, item.product?.name ?? item.product_id] as const),
    );
    const lines = new Map<string, PickLine>();

    for (const pallet of pallets) {
      for (const item of pallet.items ?? []) {
        const batchName = batchNameByItemId.get(item.batch_item_id) ?? "Unknown batch";
        const productName = productNameById.get(item.product_id) ?? item.product_id;
        const key = `${item.product_id}|${item.batch_item_id}`;
        const line = lines.get(key) ?? { key, productName, batchName, qty: 0 };
        line.qty += item.qty_units;
        lines.set(key, line);
      }
    }

    return [...lines.values()].sort((a, b) => a.productName.localeCompare(b.productName));
  }, [batches, order, pallets]);

  useEffect(() => {
    setBarcodes(Object.fromEntries(pallets.map((pallet) => [pallet.id, barcodeDataUrl(pallet.id)])));
  }, [pallets]);

  const deliveryDate = order.prepared_delivery_date
    ? new Date(order.prepared_delivery_date).toLocaleDateString()
    : "Not scheduled";
  const storeName = order.customer?.store_name ?? "Customer";

  return (
    <div className="delivery-sheet-overlay flex-1 flex flex-col gap-6 p-6">
      <div className="delivery-sheet-dialog flex w-full max-w-3xl flex-col gap-4">
        <div className="no-print page-header">
          <div>
            <h1 className="page-title">Delivery Sheet</h1>
          </div>
          <div className="flex items-center gap-3">
            <Button
              type="button"
              onClick={() => setCardMode((mode) => !mode)}
              variant="outline"
            >
              {cardMode ? "Switch to letter" : "Switch to 5×3 card"}
            </Button>
            <Button
              type="button"
              onClick={() => window.print()}
              variant="default"
            >
              <Printer size={16} /> Print
            </Button>
          </div>
        </div>

        <div id="delivery-sheet" className={`overflow-y-auto rounded-2xl border border-border bg-white p-5 font-sans text-black ${cardMode ? "card-mode" : ""}`}>
          <style>{`
            @media print {
              @page {
                size: ${cardMode ? "5in 3in" : "letter"};
                margin: ${cardMode ? "0.15in" : "0.35in"};
              }
              html, body { height: auto !important; overflow: visible !important; background: #fff !important; }
              body > *:not(:has(#delivery-sheet)) { display: none !important; }
              body:has(#delivery-sheet) [data-radix-dialog-overlay] { display: none !important; }
              body:has(#delivery-sheet) [data-radix-dialog-content] {
                position: static !important; display: block !important; width: auto !important; max-width: none !important;
                max-height: none !important; overflow: visible !important; transform: none !important; border: 0 !important;
                padding: 0 !important; box-shadow: none !important; background: transparent !important;
              }
              .delivery-sheet-overlay {
                position: static !important;
                display: block !important;
                width: 100% !important;
                padding: 0 !important;
                background: transparent !important;
              }
              .delivery-sheet-dialog {
                display: block !important;
                width: 100% !important;
                max-width: none !important;
                max-height: none !important;
                overflow: visible !important;
                border: 0 !important;
                border-radius: 0 !important;
              }
              #delivery-sheet {
                position: relative !important;
                width: 100% !important;
                max-width: 7.5in;
                margin: 0 auto !important;
                max-height: none !important;
                overflow: visible !important;
                padding: 0.15in !important;
                background: #fff !important;
                color: #111 !important;
              }
              .no-print { display: none !important; }
              .label-card { break-inside: avoid; color: #111 !important; background: #fff !important; }
              .card-mode .sheet-header, .card-mode .pick-list { display: none !important; }
              .card-mode .label-section { margin-top: 0 !important; }
              .card-mode .label-section h2 { display: none; }
              .card-mode .label-grid { display: block !important; }
              .card-mode .label-card {
                border: none !important;
                padding: 0 !important;
                height: 2.7in;
                break-after: page;
                justify-content: center;
              }
              .card-mode .label-card:last-child { break-after: auto; }
            }
          `}</style>

          <header className="sheet-header border-b border-black pb-2">
            <h1 className="text-lg font-bold">Delivery Sheet</h1>
            <p className="text-xs">Order {order.id.slice(0, 8)} · {storeName}{order.customer?.location ? ` · ${order.customer.location}` : ""}</p>
            <p className="text-xs">Delivery date: {deliveryDate} · Pallets: {pallets.length}</p>
            <img src={orderBarcode} alt={`Barcode for order ${order.id.slice(0, 8)}`} className="mt-2 h-auto w-full object-contain" />
            <p className="font-mono text-2xs">{order.id}</p>
          </header>

          <section className="pick-list mt-3">
            <h2 className="mb-1 text-sm font-bold">Pick List</h2>
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="border-b border-black text-left">
                  <th className="py-0.5">Product</th>
                  <th className="py-0.5">Take from batch</th>
                  <th className="py-0.5 text-right">Qty</th>
                </tr>
              </thead>
              <tbody>
                {pickLines.map((line) => (
                  <tr key={line.key} className="border-b border-border">
                    <td className="py-0.5">{line.productName}</td>
                    <td className="py-0.5">{line.batchName}</td>
                    <td className="py-0.5 text-right">{line.qty}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="label-section mt-4">
            <h2 className="mb-1 text-sm font-bold">Pallet Labels</h2>
            <div className="label-grid grid grid-cols-1 gap-2">
              {pallets.map((pallet, index) => {
                const units = (pallet.items ?? []).reduce((sum, item) => sum + item.qty_units, 0);
                return (
                  <div key={pallet.id} className="label-card flex flex-col items-center gap-1 border border-black p-2 text-center">
                    <p className="text-xs font-bold">Pallet {index + 1} of {pallets.length} · {units} units</p>
                    <p className="text-xs">{storeName}</p>
                    <p className="text-2xs">Delivery: {deliveryDate}</p>
                    {barcodes[pallet.id] && <img src={barcodes[pallet.id]} alt={`Barcode for pallet ${index + 1}`} className="h-auto w-full object-contain" />}
                    <p className="font-mono text-2xs">{pallet.id}</p>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
