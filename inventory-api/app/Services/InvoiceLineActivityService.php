<?php

namespace App\Services;

use App\Models\ProductPurchase;
use App\Models\ProductReturn;
use App\Models\ProductSale;
use App\Models\PurchaseProductReturn;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Collection;

class InvoiceLineActivityService
{
    public function salesInvoiceSnapshot(int $saleId): Collection
    {
        return $this->snapshot(ProductSale::class, 'sale_id', $saleId, 'sale');
    }

    public function salesReturnSnapshot(int $returnId): Collection
    {
        return $this->snapshot(ProductReturn::class, 'return_id', $returnId, 'sale');
    }

    public function purchaseInvoiceSnapshot(int $purchaseId): Collection
    {
        return $this->snapshot(ProductPurchase::class, 'purchase_id', $purchaseId, 'purchase', true);
    }

    public function purchaseReturnSnapshot(int $returnId): Collection
    {
        return $this->snapshot(PurchaseProductReturn::class, 'return_id', $returnId, 'purchase');
    }

    public function logChanges(Model $subject, string $logName, string $description, Collection $oldLines, Collection $newLines, $user): void
    {
        $old = [];
        $attributes = [];
        $lineCount = max($oldLines->count(), $newLines->count());

        for ($index = 0; $index < $lineCount; $index++) {
            $oldLine = $oldLines->get($index);
            $newLine = $newLines->get($index);

            if (($oldLine['fingerprint'] ?? null) === ($newLine['fingerprint'] ?? null)) {
                continue;
            }

            $field = 'product_line_'.($index + 1);
            $old[$field] = $oldLine['summary'] ?? null;
            $attributes[$field] = $newLine['summary'] ?? null;
        }

        if ($attributes === []) {
            return;
        }

        activity($logName)
            ->performedOn($subject)
            ->causedBy($user)
            ->event('updated')
            ->withProperties([
                'old' => $old,
                'attributes' => $attributes,
            ])
            ->log($description);
    }

    private function snapshot(string $modelClass, string $foreignKey, int $ownerId, string $unitType, bool $includeReceived = false): Collection
    {
        return $modelClass::query()
            ->with([
                'product:id,name,code',
                'unit:id,unit_code,unit_name',
                'batch:id,batch_no,expired_date',
                'variant:id,name',
            ])
            ->where($foreignKey, $ownerId)
            ->orderBy('id')
            ->get()
            ->map(fn (Model $line): array => $this->lineSnapshot($line, $unitType, $includeReceived))
            ->values();
    }

    private function lineSnapshot(Model $line, string $unitType, bool $includeReceived): array
    {
        $unitKey = $unitType === 'purchase' ? 'purchase_unit_id' : 'sale_unit_id';
        $amountKey = $unitType === 'purchase' ? 'net_unit_cost' : 'net_unit_price';
        $fingerprint = [
            'product_id' => (int) $line->product_id,
            'variant_id' => $line->variant_id ? (int) $line->variant_id : null,
            'product_batch_id' => $line->product_batch_id ? (int) $line->product_batch_id : null,
            'batch_no' => $line->batch_no ?? null,
            'expired_date' => $line->expired_date?->toDateString(),
            'qty' => $this->rounded($line->qty),
            $unitKey => (int) $line->{$unitKey},
            $amountKey => $this->rounded($line->{$amountKey}),
            'discount' => $this->rounded($line->discount),
            'tax_rate' => $this->rounded($line->tax_rate),
            'tax' => $this->rounded($line->tax),
            'total' => $this->rounded($line->total),
        ];

        if ($includeReceived) {
            $fingerprint['received'] = $this->rounded($line->recieved);
        }

        if ($unitType === 'sale') {
            $fingerprint['unit_cost'] = $this->rounded($line->unit_cost);
            $fingerprint['total_cost'] = $this->rounded($line->total_cost);
        }

        return [
            'fingerprint' => $fingerprint,
            'summary' => $this->lineSummary($line, $unitKey, $amountKey, $includeReceived, $unitType === 'sale'),
        ];
    }

    private function lineSummary(Model $line, string $unitKey, string $amountKey, bool $includeReceived, bool $includeCost): string
    {
        $product = $line->product
            ? trim($line->product->name.' '.($line->product->code ? "({$line->product->code})" : ''))
            : "Product #{$line->product_id}";
        $unit = $line->unit?->unit_code ?? $line->unit?->unit_name ?? "Unit #{$line->{$unitKey}}";
        $batch = ($line->batch_no ?? null) ?: $line->batch?->batch_no;
        $parts = [
            $product.($line->variant ? ", variant {$line->variant->name}" : '').($batch ? ", batch {$batch}" : '').($line->expired_date ? ', expiry '.$line->expired_date->toDateString() : ''),
            'qty '.$this->number($line->qty),
        ];

        if ($includeReceived) {
            $parts[] = 'received '.$this->number($line->recieved);
        }

        array_push(
            $parts,
            'unit '.$unit,
            'unit amount '.$this->number($line->{$amountKey}),
            'discount '.$this->number($line->discount),
            'tax rate '.$this->number($line->tax_rate),
            'tax '.$this->number($line->tax),
            'total '.$this->number($line->total),
        );

        if ($includeCost) {
            $parts[] = 'unit cost '.$this->number($line->unit_cost);
            $parts[] = 'total cost '.$this->number($line->total_cost);
        }

        return implode(', ', $parts);
    }

    private function rounded(mixed $value): float
    {
        return round((float) $value, 4);
    }

    private function number(mixed $value): string
    {
        return rtrim(rtrim(number_format((float) $value, 4, '.', ''), '0'), '.') ?: '0';
    }
}
