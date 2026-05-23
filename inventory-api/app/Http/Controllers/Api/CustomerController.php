<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\CustomerRequest;
use App\Http\Resources\CustomerResource;
use App\Models\Customer;
use App\Models\CustomerGroup;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Spatie\Permission\Models\Role;

class CustomerController extends Controller
{
    public function index(Request $request)
    {
        $perPage = min(max((int) $request->integer('per_page', 15), 1), 100);

        return CustomerResource::collection(
            Customer::query()
                ->with(['customerGroup:id,name,percentage', 'user:id,name,email'])
                ->where('is_active', true)
                ->when($request->filled('search'), function ($query) use ($request) {
                    $terms = preg_split('/\s+/', trim((string) $request->string('search')), -1, PREG_SPLIT_NO_EMPTY);

                    foreach ($terms as $term) {
                        $query->where(function ($subQuery) use ($term) {
                            $subQuery->where('name', 'like', "%{$term}%")
                                ->orWhere('company_name', 'like', "%{$term}%")
                                ->orWhere('email', 'like', "%{$term}%")
                                ->orWhere('phone_number', 'like', "%{$term}%")
                                ->orWhere('tax_no', 'like', "%{$term}%")
                                ->orWhere('address', 'like', "%{$term}%")
                                ->orWhere('city', 'like', "%{$term}%")
                                ->orWhere('state', 'like', "%{$term}%")
                                ->orWhere('postal_code', 'like', "%{$term}%")
                                ->orWhere('country', 'like', "%{$term}%")
                                ->orWhereHas('customerGroup', fn ($groupQuery) => $groupQuery->where('name', 'like', "%{$term}%"))
                                ->orWhereHas('user', fn ($userQuery) => $userQuery->where('name', 'like', "%{$term}%")->orWhere('email', 'like', "%{$term}%"));
                        });
                    }
                })
                ->latest()
                ->paginate($perPage)
                ->withQueryString()
        );
    }

    public function options()
    {
        return response()->json([
            'data' => [
                'customer_groups' => CustomerGroup::query()
                    ->where('is_active', true)
                    ->orderBy('name')
                    ->get(['id', 'name', 'percentage']),
            ],
        ]);
    }

    public function store(CustomerRequest $request)
    {
        $customer = DB::transaction(function () use ($request) {
            $data = $request->validated();
            $customerData = $this->customerData($data);

            if ($request->boolean('create_user')) {
                $customerData['user_id'] = $this->createLinkedUser($data)->id;
            }

            return Customer::create($customerData)->load(['customerGroup:id,name,percentage', 'user:id,name,email']);
        });

        return response()->json([
            'message' => $customer->user_id ? 'Customer and user created successfully.' : 'Customer created successfully.',
            'data' => new CustomerResource($customer),
        ], 201);
    }

    public function show(Customer $customer)
    {
        return response()->json([
            'data' => new CustomerResource($customer->load(['customerGroup:id,name,percentage', 'user:id,name,email'])),
        ]);
    }

    public function update(CustomerRequest $request, Customer $customer)
    {
        $customer = DB::transaction(function () use ($request, $customer) {
            $data = $request->validated();
            $customerData = $this->customerData($data);

            if ($request->boolean('create_user') && ! $customer->user_id) {
                $customerData['user_id'] = $this->createLinkedUser($data)->id;
            }

            $customer->update($customerData);

            return $customer->load(['customerGroup:id,name,percentage', 'user:id,name,email']);
        });

        return response()->json([
            'message' => 'Customer updated successfully.',
            'data' => new CustomerResource($customer),
        ]);
    }

    public function destroy(Customer $customer)
    {
        $customer->update(['is_active' => false]);

        return response()->json([
            'message' => 'Customer deleted successfully.',
        ]);
    }

    private function customerData(array $data): array
    {
        return [
            'customer_group_id' => $data['customer_group_id'],
            'name' => $data['name'],
            'company_name' => $data['company_name'] ?? null,
            'email' => $data['email'] ?? null,
            'phone_number' => $data['phone_number'],
            'tax_no' => $data['tax_no'] ?? null,
            'address' => $data['address'],
            'city' => $data['city'],
            'state' => $data['state'] ?? null,
            'postal_code' => $data['postal_code'] ?? null,
            'country' => $data['country'] ?? null,
            'deposit' => $data['deposit'] ?? 0,
            'expense' => $data['expense'] ?? 0,
            'is_active' => $data['is_active'] ?? true,
        ];
    }

    private function createLinkedUser(array $data): User
    {
        validator($data, [
            'email' => [
                'required',
                'email',
                'max:255',
                Rule::unique('users', 'email'),
            ],
        ])->validate();

        $role = Role::query()->firstOrCreate(
            ['name' => 'Customer'],
            ['guard_name' => 'web', 'description' => 'Customer portal user.', 'is_active' => true]
        );

        $user = User::create([
            'name' => $data['username'],
            'email' => $data['email'],
            'password' => $data['password'],
            'phone' => $data['phone_number'],
            'company_name' => $data['company_name'] ?? null,
            'role_id' => $role->id,
            'is_active' => true,
            'is_deleted' => false,
        ]);

        $user->assignRole($role);

        return $user;
    }
}
