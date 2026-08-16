<?php

namespace Tests\Feature;

use App\Models\Product;
use Database\Seeders\LegacyProductSeeder;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class LegacyProductSeederTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        Schema::create('products', function (Blueprint $table) {
            $table->increments('id');
            $table->string('name');
            $table->string('code');
            $table->string('type');
            $table->string('barcode_symbology');
            $table->integer('brand_id')->nullable();
            $table->integer('category_id');
            $table->integer('unit_id');
            $table->integer('purchase_unit_id');
            $table->integer('sale_unit_id');
            $table->string('cost');
            $table->string('price');
            $table->double('qty')->nullable();
            $table->double('alert_quantity')->nullable();
            $table->boolean('promotion')->nullable();
            $table->string('promotion_price')->nullable();
            $table->date('starting_date')->nullable();
            $table->date('last_date')->nullable();
            $table->integer('tax_id')->nullable();
            $table->integer('tax_method')->nullable();
            $table->longText('image')->nullable();
            $table->string('file')->nullable();
            $table->boolean('featured')->nullable();
            $table->text('product_details')->nullable();
            $table->string('product_list')->nullable();
            $table->string('qty_list')->nullable();
            $table->string('price_list')->nullable();
            $table->boolean('is_variant')->nullable();
            $table->boolean('is_batch')->nullable();
            $table->boolean('is_diffPrice')->nullable();
            $table->boolean('is_active')->nullable();
            $table->timestamps();
        });
    }

    public function test_it_replaces_products_with_standard_products_from_the_legacy_dump(): void
    {
        Product::query()->create([
            'name' => 'Product to remove',
            'code' => 'REMOVE-ME',
            'type' => 'standard',
            'barcode_symbology' => 'C128',
            'category_id' => 1,
            'unit_id' => 1,
            'purchase_unit_id' => 1,
            'sale_unit_id' => 1,
            'cost' => '1.00',
            'price' => '1.00',
            'qty' => 10,
        ]);

        $this->seed(LegacyProductSeeder::class);

        $this->assertDatabaseMissing('products', ['code' => 'REMOVE-ME']);
        $this->assertGreaterThan(400, Product::query()->count());
        $this->assertSame(487, Product::query()->max('id'));
        $this->assertSame(0, Product::query()->where('type', '!=', 'standard')->count());
        $this->assertSame(0, Product::query()->where('unit_id', '!=', 1)->count());
        $this->assertSame(0, Product::query()->where('purchase_unit_id', '!=', 1)->count());
        $this->assertSame(0, Product::query()->where('sale_unit_id', '!=', 1)->count());
        $this->assertSame(0, Product::query()->where('qty', '!=', 0)->count());
        $this->assertSame(0, Product::query()->where('is_variant', true)->count());
        $this->assertSame(0, Product::query()->where('is_batch', true)->count());
        $this->assertSame(0, Product::query()->whereNotNull('product_list')->count());

        $product = Product::query()->findOrFail(1);

        $this->assertSame('Regency Neem Tulshi Honey Facewash', $product->name);
        $this->assertSame('1', $product->code);
        $this->assertSame('standard', $product->type);
        $this->assertSame('C128', $product->barcode_symbology);
        $this->assertSame(1, $product->brand_id);
        $this->assertSame(1, $product->category_id);
        $this->assertSame(1, $product->unit_id);
        $this->assertSame(1, $product->purchase_unit_id);
        $this->assertSame(1, $product->sale_unit_id);
        $this->assertSame('96.00', $product->cost);
        $this->assertSame('120.00', $product->price);
        $this->assertSame(0.0, $product->qty);
        $this->assertSame('regency-neem-tulshi-honey-facewash-2020-07-15.jpg', $product->image);
        $this->assertFalse($product->promotion);
        $this->assertFalse($product->featured);
        $this->assertFalse($product->is_variant);
        $this->assertFalse($product->is_batch);
        $this->assertFalse($product->is_diffPrice);
        $this->assertTrue($product->is_active);
        $this->assertStringContainsString('Gentle For Every Skin', $product->product_details);
        $this->assertSame('2020-06-12 14:04:11', $product->created_at->format('Y-m-d H:i:s'));
        $this->assertSame('2021-10-12 19:33:34', $product->updated_at->format('Y-m-d H:i:s'));
    }
}
