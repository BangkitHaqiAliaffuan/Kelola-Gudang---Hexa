// Types mirroring the Laravel Persediaan API (App\Http\Controllers\StockController +
// App\Http\Resources\StockRowResource).

export type ValuationMethod = "FIFO" | "Average" | "Maximum Cost";

export type StockRowApi = {
  id: string;
  item_id: number;
  sku: string | null;
  name: string | null;
  unit: string | null;
  min: number | null;
  max: number | null;
  cost: number;
  warehouse_id: number;
  warehouse: string | null;
  rack: string | null;
  bin: string | null;
  stock: number;
  reserved: number;
  available: number;
  unit_cost_avg: number;
  nilai: number;
  status: "Habis" | "Menipis" | "Overstock" | "Normal";
};

export type StockCardRowApi = {
  date: string;
  no: string;
  type: string;
  direction: "IN" | "OUT";
  masuk: number;
  keluar: number;
  saldo: number;
  unit: string | null;
  unit_cost: number;
  nilai: number;
  pic: string;
  note: string;
  partner: string;
  reference: string;
};

export type StockCardApi = {
  item: {
    id: number;
    sku: string;
    name: string;
    unit: string | null;
    min: number | null;
    max: number | null;
    cost: number;
    warehouse: string | null;
    current_stock: number;
    reserved: number;
  };
  method: ValuationMethod;
  saldo_awal: number;
  saldo_akhir: number;
  rows: StockCardRowApi[];
};
