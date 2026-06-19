<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

Artisan::command('stock:backfill-movements', function () {
    $convert = function (float $qty, mixed $unit): float {
        if (! $unit) return $qty;
        if ($unit->operator === '*') return $qty * (float) $unit->operation_value;
        if ($unit->operator === '/' && (float) $unit->operation_value !== 0.0) return $qty / (float) $unit->operation_value;
        return $qty;
    };

    $create = function (array $data) {
        $exists = DB::table('product_stock_movements')
            ->where('source_type', $data['source_type'])
            ->where('source_id', $data['source_id'])
            ->where('product_id', $data['product_id'])
            ->where('type', $data['type'])
            ->where('warehouse_id', $data['warehouse_id'])
            ->where(function ($query) use ($data) {
                $data['variant_id'] ? $query->where('variant_id', $data['variant_id']) : $query->whereNull('variant_id');
            })
            ->where(function ($query) use ($data) {
                $data['product_batch_id'] ? $query->where('product_batch_id', $data['product_batch_id']) : $query->whereNull('product_batch_id');
            })
            ->exists();

        if ($exists) return false;

        $createdAt = $data['created_at'] ?? now();

        DB::table('product_stock_movements')->insert($data + [
            'before_quantity' => 0,
            'after_quantity' => 0,
            'created_at' => $createdAt,
            'updated_at' => $createdAt,
        ]);

        return true;
    };

    $recalculateBalances = function (): void {
        $running = [];

        DB::table('product_stock_movements')
            ->orderBy('movement_date')
            ->orderBy('created_at')
            ->orderBy('id')
            ->select('id', 'product_id', 'warehouse_id', 'variant_id', 'product_batch_id', 'quantity_base')
            ->chunk(500, function ($rows) use (&$running) {
                foreach ($rows as $row) {
                    $key = implode(':', [
                        $row->product_id,
                        $row->warehouse_id ?? 0,
                        $row->variant_id ?? 0,
                        $row->product_batch_id ?? 0,
                    ]);

                    $before = $running[$key] ?? 0.0;
                    $after = $before + (float) $row->quantity_base;
                    $running[$key] = $after;

                    DB::table('product_stock_movements')
                        ->where('id', $row->id)
                        ->update([
                            'before_quantity' => $before,
                            'after_quantity' => $after,
                        ]);
                }
            });
    };

    $count = 0;

    DB::table('product_sales')
        ->join('sales', 'sales.id', '=', 'product_sales.sale_id')
        ->join('products', 'products.id', '=', 'product_sales.product_id')
        ->leftJoin('units', 'units.id', '=', 'product_sales.sale_unit_id')
        ->where('products.type', '!=', 'digital')
        ->orderBy('product_sales.id')
        ->select('product_sales.*', 'sales.reference_no', 'sales.warehouse_id', 'sales.user_id', 'sales.created_at as movement_created_at', 'units.operator', 'units.operation_value')
        ->chunk(500, function ($rows) use (&$count, $convert, $create) {
            foreach ($rows as $row) {
                $base = $convert((float) $row->qty, $row);
                $count += $create([
                    'product_id' => $row->product_id,
                    'warehouse_id' => $row->warehouse_id,
                    'product_batch_id' => $row->product_batch_id,
                    'variant_id' => $row->variant_id,
                    'unit_id' => $row->sale_unit_id ?: null,
                    'user_id' => $row->user_id,
                    'source_type' => 'product_sale',
                    'source_id' => $row->id,
                    'type' => 'product_sale',
                    'quantity' => -1 * (float) $row->qty,
                    'quantity_base' => -1 * $base,
                    'reference_no' => $row->reference_no,
                    'movement_date' => substr((string) $row->movement_created_at, 0, 10),
                    'created_at' => $row->movement_created_at,
                ]) ? 1 : 0;
            }
        });

    DB::table('product_returns')
        ->join('returns', 'returns.id', '=', 'product_returns.return_id')
        ->join('products', 'products.id', '=', 'product_returns.product_id')
        ->leftJoin('units', 'units.id', '=', 'product_returns.sale_unit_id')
        ->where('products.type', '!=', 'digital')
        ->orderBy('product_returns.id')
        ->select('product_returns.*', 'returns.reference_no', 'returns.warehouse_id', 'returns.user_id', 'returns.created_at as movement_created_at', 'units.operator', 'units.operation_value')
        ->chunk(500, function ($rows) use (&$count, $convert, $create) {
            foreach ($rows as $row) {
                $base = $convert((float) $row->qty, $row);
                $count += $create([
                    'product_id' => $row->product_id,
                    'warehouse_id' => $row->warehouse_id,
                    'product_batch_id' => $row->product_batch_id,
                    'variant_id' => $row->variant_id,
                    'unit_id' => $row->sale_unit_id ?: null,
                    'user_id' => $row->user_id,
                    'source_type' => 'product_return',
                    'source_id' => $row->id,
                    'type' => 'product_return',
                    'quantity' => (float) $row->qty,
                    'quantity_base' => $base,
                    'reference_no' => $row->reference_no,
                    'movement_date' => substr((string) $row->movement_created_at, 0, 10),
                    'created_at' => $row->movement_created_at,
                ]) ? 1 : 0;
            }
        });

    DB::table('product_purchases')
        ->join('purchases', 'purchases.id', '=', 'product_purchases.purchase_id')
        ->join('products', 'products.id', '=', 'product_purchases.product_id')
        ->leftJoin('units', 'units.id', '=', 'product_purchases.purchase_unit_id')
        ->where('products.type', '!=', 'digital')
        ->where('product_purchases.recieved', '>', 0)
        ->orderBy('product_purchases.id')
        ->select('product_purchases.*', 'purchases.reference_no', 'purchases.warehouse_id', 'purchases.user_id', 'purchases.created_at as movement_created_at', 'units.operator', 'units.operation_value')
        ->chunk(500, function ($rows) use (&$count, $convert, $create) {
            foreach ($rows as $row) {
                $base = $convert((float) $row->recieved, $row);
                $count += $create([
                    'product_id' => $row->product_id,
                    'warehouse_id' => $row->warehouse_id,
                    'product_batch_id' => $row->product_batch_id,
                    'variant_id' => $row->variant_id,
                    'unit_id' => $row->purchase_unit_id ?: null,
                    'user_id' => $row->user_id,
                    'source_type' => 'product_purchase',
                    'source_id' => $row->id,
                    'type' => 'purchase',
                    'quantity' => (float) $row->recieved,
                    'quantity_base' => $base,
                    'reference_no' => $row->reference_no,
                    'movement_date' => substr((string) $row->movement_created_at, 0, 10),
                    'created_at' => $row->movement_created_at,
                ]) ? 1 : 0;
            }
        });

    DB::table('purchase_product_return')
        ->join('return_purchases', 'return_purchases.id', '=', 'purchase_product_return.return_id')
        ->join('products', 'products.id', '=', 'purchase_product_return.product_id')
        ->leftJoin('units', 'units.id', '=', 'purchase_product_return.purchase_unit_id')
        ->where('products.type', '!=', 'digital')
        ->orderBy('purchase_product_return.id')
        ->select('purchase_product_return.*', 'return_purchases.reference_no', 'return_purchases.warehouse_id', 'return_purchases.user_id', 'return_purchases.created_at as movement_created_at', 'units.operator', 'units.operation_value')
        ->chunk(500, function ($rows) use (&$count, $convert, $create) {
            foreach ($rows as $row) {
                $base = $convert((float) $row->qty, $row);
                $count += $create([
                    'product_id' => $row->product_id,
                    'warehouse_id' => $row->warehouse_id,
                    'product_batch_id' => $row->product_batch_id ?? null,
                    'variant_id' => $row->variant_id ?? null,
                    'unit_id' => $row->purchase_unit_id ?: null,
                    'user_id' => $row->user_id,
                    'source_type' => 'purchase_product_return',
                    'source_id' => $row->id,
                    'type' => 'purchase_return',
                    'quantity' => -1 * (float) $row->qty,
                    'quantity_base' => -1 * $base,
                    'reference_no' => $row->reference_no,
                    'movement_date' => substr((string) $row->movement_created_at, 0, 10),
                    'created_at' => $row->movement_created_at,
                ]) ? 1 : 0;
            }
        });

    DB::table('product_transfer')
        ->join('transfers', 'transfers.id', '=', 'product_transfer.transfer_id')
        ->join('products', 'products.id', '=', 'product_transfer.product_id')
        ->leftJoin('units', 'units.id', '=', 'product_transfer.purchase_unit_id')
        ->where('products.type', '!=', 'digital')
        ->orderBy('product_transfer.id')
        ->select('product_transfer.*', 'transfers.reference_no', 'transfers.from_warehouse_id', 'transfers.to_warehouse_id', 'transfers.created_at as movement_created_at', 'units.operator', 'units.operation_value')
        ->chunk(500, function ($rows) use (&$count, $convert, $create) {
            foreach ($rows as $row) {
                $base = $convert((float) $row->qty, $row);
                foreach ([['transfer_out', $row->from_warehouse_id, -1], ['transfer_in', $row->to_warehouse_id, 1]] as [$type, $warehouseId, $sign]) {
                    $count += $create([
                        'product_id' => $row->product_id,
                        'warehouse_id' => $warehouseId,
                        'product_batch_id' => $row->product_batch_id ?? null,
                        'variant_id' => $row->variant_id ?? null,
                        'unit_id' => $row->purchase_unit_id ?: null,
                        'user_id' => null,
                        'source_type' => 'product_transfer',
                        'source_id' => $row->id,
                        'type' => $type,
                        'quantity' => $sign * (float) $row->qty,
                        'quantity_base' => $sign * $base,
                        'reference_no' => $row->reference_no,
                        'movement_date' => substr((string) $row->movement_created_at, 0, 10),
                        'created_at' => $row->movement_created_at,
                    ]) ? 1 : 0;
                }
            }
        });

    DB::table('product_adjustments')
        ->join('adjustments', 'adjustments.id', '=', 'product_adjustments.adjustment_id')
        ->join('products', 'products.id', '=', 'product_adjustments.product_id')
        ->where('products.type', '!=', 'digital')
        ->orderBy('product_adjustments.id')
        ->select('product_adjustments.*', 'adjustments.reference_no', 'adjustments.warehouse_id', 'adjustments.note', 'adjustments.created_at as movement_created_at')
        ->chunk(500, function ($rows) use (&$count, $create) {
            foreach ($rows as $row) {
                $sign = in_array(strtolower((string) $row->action), ['-', 'subtract', 'minus', 'decrease'], true) ? -1 : 1;
                $qty = (float) $row->qty;

                $count += $create([
                    'product_id' => $row->product_id,
                    'warehouse_id' => $row->warehouse_id,
                    'product_batch_id' => null,
                    'variant_id' => $row->variant_id ?? null,
                    'unit_id' => null,
                    'user_id' => null,
                    'source_type' => 'product_adjustment',
                    'source_id' => $row->id,
                    'type' => $sign > 0 ? 'stock_increase' : 'stock_decrease',
                    'quantity' => $sign * $qty,
                    'quantity_base' => $sign * $qty,
                    'reference_no' => $row->reference_no,
                    'note' => $row->note,
                    'movement_date' => substr((string) $row->movement_created_at, 0, 10),
                    'created_at' => $row->movement_created_at,
                ]) ? 1 : 0;
            }
        });

    $recalculateBalances();

    $this->info("Backfilled {$count} stock movement rows and recalculated stock movement balances.");
})->purpose('Backfill product stock movement ledger from existing transaction lines');
