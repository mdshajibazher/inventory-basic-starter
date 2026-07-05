<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\SmsLogResource;
use App\Models\SmsLog;
use Illuminate\Http\Request;

class SmsLogController extends Controller
{
    public function index(Request $request)
    {
        $perPage = min(max((int) $request->integer('per_page', 15), 1), 100);

        return SmsLogResource::collection(
            SmsLog::query()
                ->with('user:id,name,email,phone')
                ->when($request->filled('status'), fn ($query) => $query->where('status', $request->string('status')))
                ->when($request->filled('record_type'), fn ($query) => $query->where('record_type', $request->string('record_type')))
                ->when($request->filled('from'), fn ($query) => $query->whereDate('created_at', '>=', $request->date('from')))
                ->when($request->filled('to'), fn ($query) => $query->whereDate('created_at', '<=', $request->date('to')))
                ->when($request->filled('search'), function ($query) use ($request) {
                    $terms = preg_split('/\s+/', trim((string) $request->string('search')), -1, PREG_SPLIT_NO_EMPTY);

                    foreach ($terms as $term) {
                        $query->where(function ($subQuery) use ($term) {
                            $subQuery->where('phone_number', 'like', "%{$term}%")
                                ->orWhere('message', 'like', "%{$term}%")
                                ->orWhere('status', 'like', "%{$term}%")
                                ->orWhere('provider_response', 'like', "%{$term}%")
                                ->orWhere('record_type', 'like', "%{$term}%")
                                ->orWhereHas('user', fn ($userQuery) => $userQuery->where('name', 'like', "%{$term}%")
                                    ->orWhere('email', 'like', "%{$term}%")
                                    ->orWhere('phone', 'like', "%{$term}%"));
                        });
                    }
                })
                ->latest()
                ->paginate($perPage)
                ->withQueryString()
        );
    }
}
