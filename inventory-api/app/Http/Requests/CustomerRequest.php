<?php

namespace App\Http\Requests;

use App\Models\Customer;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class CustomerRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        /** @var Customer|null $customer */
        $customer = $this->route('customer');
        $creatingUser = $this->boolean('create_user') && ! $customer?->user_id;

        return [
            'customer_group_id' => ['required', 'integer', Rule::exists('customer_groups', 'id')->where('is_active', true)],
            'name' => ['required', 'string', 'max:255'],
            'company_name' => ['nullable', 'string', 'max:255'],
            'email' => [$creatingUser ? 'required' : 'nullable', 'email', 'max:255'],
            'phone_number' => [
                'required',
                'string',
                'max:255',
                Rule::unique('customers', 'phone_number')
                    ->where('is_active', true)
                    ->ignore($customer?->id),
            ],
            'tax_no' => ['nullable', 'string', 'max:255'],
            'address' => ['required', 'string', 'max:255'],
            'city' => ['required', 'string', 'max:255'],
            'state' => ['nullable', 'string', 'max:255'],
            'postal_code' => ['nullable', 'string', 'max:255'],
            'country' => ['nullable', 'string', 'max:255'],
            'deposit' => ['nullable', 'numeric', 'min:0'],
            'expense' => ['nullable', 'numeric', 'min:0'],
            'is_active' => ['nullable', 'boolean'],
            'create_user' => ['nullable', 'boolean'],
            'username' => [$creatingUser ? 'required' : 'nullable', 'string', 'max:255'],
            'password' => [$creatingUser ? 'required' : 'nullable', 'string', 'min:6'],
        ];
    }
}
