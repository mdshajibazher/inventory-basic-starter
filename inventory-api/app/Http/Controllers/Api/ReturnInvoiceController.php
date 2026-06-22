<?php

namespace App\Http\Controllers\Api;

use App\Actions\Sales\StoreReturnInvoiceAction;
use App\Http\Controllers\Controller;
use App\Http\Requests\StoreReturnInvoiceRequest;
use App\Http\Resources\ReturnInvoiceResource;
use App\Models\ReturnInvoice;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;
use Throwable;

class ReturnInvoiceController extends Controller
{
    private const RELATIONS = [
        'customer:id,name,email,phone_number',
        'warehouse:id,name',
        'biller:id,name,company_name',
        'user:id,name,email',
        'products.product:id,name,code,type,purchase_unit_id,sale_unit_id,cost,price,tax_id,is_batch',
        'products.unit:id,unit_code,unit_name',
        'products.batch:id,batch_no,expired_date',
        'products.variant:id,name',
    ];

    public function index(Request $request): JsonResponse
    {
        $perPage = min((int) $request->query('per_page', 15), 100);
        $search = trim((string) $request->query('search', ''));

        $returns = ReturnInvoice::query()
            ->with(['customer:id,name', 'warehouse:id,name', 'biller:id,name'])
            ->when($request->filled('customer_id'), fn ($query) => $query->where('customer_id', $request->integer('customer_id')))
            ->when($search !== '', function ($query) use ($search) {
                $query->where(function ($searchQuery) use ($search) {
                    $searchQuery->where('reference_no', 'like', "%{$search}%")
                        ->orWhereHas('customer', fn ($customer) => $customer->where('name', 'like', "%{$search}%"));
                });
            })
            ->latest('id')
            ->paginate($perPage);

        return response()->json(ReturnInvoiceResource::collection($returns)->response()->getData(true));
    }

    public function show(ReturnInvoice $returnInvoice): JsonResponse
    {
        return response()->json([
            'data' => new ReturnInvoiceResource($returnInvoice->load(self::RELATIONS)),
        ]);
    }

    public function store(StoreReturnInvoiceRequest $request, StoreReturnInvoiceAction $storeReturnInvoice): JsonResponse
    {
        try {
            $returnInvoice = $storeReturnInvoice->execute(
                $request->validated(),
                $request->user(),
                $request->file('document')
            );

            return response()->json([
                'message' => 'Return invoice created successfully.',
                'data' => new ReturnInvoiceResource($returnInvoice),
            ], 201);
        } catch (ValidationException $exception) {
            throw $exception;
        } catch (Throwable $exception) {
            Log::error('Failed to create return invoice.', [
                'user_id' => $request->user()?->id,
                'reference_no' => $request->input('reference_no'),
                'exception' => $exception,
            ]);

            return response()->json([
                'message' => 'Unable to create return invoice.',
            ], 500);
        }
    }

    public function update(StoreReturnInvoiceRequest $request, ReturnInvoice $returnInvoice, StoreReturnInvoiceAction $storeReturnInvoice): JsonResponse
    {
        try {
            $previousDocument = $returnInvoice->document;
            $returnInvoice = $storeReturnInvoice->execute(
                $request->validated(),
                $request->user(),
                $request->file('document'),
                $returnInvoice
            );

            if ($request->hasFile('document') && $previousDocument && $previousDocument !== $returnInvoice->document) {
                Storage::disk('public')->delete($previousDocument);
            }

            return response()->json([
                'message' => 'Return invoice updated successfully.',
                'data' => new ReturnInvoiceResource($returnInvoice),
            ]);
        } catch (ValidationException $exception) {
            throw $exception;
        } catch (Throwable $exception) {
            Log::error('Failed to update return invoice.', [
                'user_id' => $request->user()?->id,
                'return_id' => $returnInvoice->id,
                'exception' => $exception,
            ]);

            return response()->json([
                'message' => 'Unable to update return invoice.',
            ], 500);
        }
    }
}
