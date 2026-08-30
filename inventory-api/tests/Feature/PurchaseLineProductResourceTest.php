<?php

namespace Tests\Feature;

use App\Http\Resources\ProductPurchaseResource;
use App\Http\Resources\PurchaseProductReturnResource;
use App\Models\Product;
use App\Models\ProductPurchase;
use App\Models\ProductVariant;
use App\Models\PurchaseProductReturn;
use App\Models\Variant;
use Illuminate\Database\Eloquent\Collection;
use Tests\TestCase;

class PurchaseLineProductResourceTest extends TestCase
{
    public function test_purchase_line_products_flatten_variant_names_for_edit_forms(): void
    {
        $product = new Product([
            'name' => 'Test Variant Product',
            'code' => 'PC-PC',
            'type' => 'standard',
            'barcode_symbology' => 'C128',
            'category_id' => 1,
            'unit_id' => 1,
            'purchase_unit_id' => 1,
            'sale_unit_id' => 1,
            'cost' => '500',
            'price' => '600',
            'is_variant' => true,
            'is_active' => true,
        ]);
        $product->id = 10;
        $variant = new Variant(['name' => 'Red XL']);
        $variant->id = 20;
        $productVariant = new ProductVariant([
            'product_id' => 10,
            'variant_id' => 20,
            'position' => 1,
            'item_code' => '75907281-RED-XL',
            'additional_price' => 0,
        ]);
        $productVariant->id = 30;
        $productVariant->setRelation('variant', $variant);
        $product->setRelation('variants', new Collection([$productVariant]));

        $purchaseLine = new ProductPurchase([
            'product_id' => $product->id,
            'qty' => 10,
            'recieved' => 10,
            'purchase_unit_id' => 1,
            'net_unit_cost' => 500,
            'discount' => 0,
            'tax_rate' => 0,
            'tax' => 0,
            'total' => 5000,
        ]);
        $purchaseLine->setRelation('product', $product);

        $returnLine = new PurchaseProductReturn([
            'product_id' => $product->id,
            'qty' => 1,
            'purchase_unit_id' => 1,
            'net_unit_cost' => 500,
            'discount' => 0,
            'tax_rate' => 0,
            'tax' => 0,
            'total' => 500,
        ]);
        $returnLine->setRelation('product', $product);

        $purchaseData = (new ProductPurchaseResource($purchaseLine))->response()->getData(true)['data'];
        $returnData = (new PurchaseProductReturnResource($returnLine))->response()->getData(true)['data'];

        $this->assertSame('Red XL', $purchaseData['product']['variants'][0]['name']);
        $this->assertSame('75907281-RED-XL', $purchaseData['product']['variants'][0]['item_code']);
        $this->assertSame('Red XL', $returnData['product']['variants'][0]['name']);
        $this->assertSame('75907281-RED-XL', $returnData['product']['variants'][0]['item_code']);
    }
}
