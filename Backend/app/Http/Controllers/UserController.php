<?php

namespace App\Http\Controllers;

use App\Http\Resources\UserResource;
use App\Models\User;
use Illuminate\Http\Request;

class UserController extends Controller
{
    /**
     * Read-only reference list of users, used by PIC / kepala departemen selects.
     */
    public function index(Request $request)
    {
        $query = User::query();

        if ($search = $request->query('search')) {
            $needle = strtolower($search);
            $query->where(function ($q) use ($needle) {
                $q->whereRaw('LOWER(name) LIKE ?', ["%{$needle}%"])
                    ->orWhereRaw('LOWER(email) LIKE ?', ["%{$needle}%"]);
            });
        }

        $query->orderBy('name');

        $users = $query->paginate((int) $request->query('per_page', 20));

        return UserResource::collection($users);
    }
}
