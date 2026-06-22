<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class GeneralSetting extends Model
{
    protected $fillable = [
        'site_title',
        'site_logo',
        'favicon',
        'company_name',
        'company_address',
        'company_email',
        'company_phone',
        'currency',
        'currency_position',
        'staff_access',
        'date_format',
        'developed_by',
        'invoice_format',
        'state',
        'theme',
    ];
}
