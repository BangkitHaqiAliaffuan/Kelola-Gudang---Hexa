<?php

namespace App\Http\Controllers;

use App\Http\Requests\StoreCustomerRequest;
use App\Http\Requests\UpdateCustomerRequest;
use App\Http\Resources\CustomerResource;
use App\Models\Customer;
use App\Support\CodeGenerator;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class CustomerController extends Controller
{
    public function index(Request $request)
    {
        $query = Customer::query();

        if ($search = $request->query('search')) {
            $needle = strtolower($search);
            $query->where(function ($q) use ($needle) {
                $q->whereRaw('LOWER(name) LIKE ?', ["%{$needle}%"])
                    ->orWhereRaw('LOWER(code) LIKE ?', ["%{$needle}%"])
                    ->orWhereRaw('LOWER(city) LIKE ?', ["%{$needle}%"]);
            });
        }

        $query->orderBy('name');

        $customers = $query->paginate((int) $request->query('per_page', 20));

        return CustomerResource::collection($customers);
    }

    public function store(StoreCustomerRequest $request): CustomerResource
    {
        $data = $request->validated();
        $data['is_active'] = $data['is_active'] ?? true;

        $customer = DB::transaction(function () use ($data) {
            $data['code'] = $data['code'] ?? CodeGenerator::next(Customer::class, 'CUS');

            return Customer::create($data);
        });

        return new CustomerResource($customer);
    }

    public function show(Customer $customer): CustomerResource
    {
        return new CustomerResource($customer);
    }

    public function update(UpdateCustomerRequest $request, Customer $customer): CustomerResource
    {
        $customer->update($request->validated());

        return new CustomerResource($customer->fresh());
    }

    public function destroy(Customer $customer): JsonResponse
    {
        $customer->delete();

        return response()->json(['message' => 'Customer berhasil dihapus.'], 200);
    }
}
