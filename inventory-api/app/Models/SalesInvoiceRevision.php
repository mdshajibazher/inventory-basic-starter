<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SalesInvoiceRevision extends Model
{
    public const STATUS_PENDING = 'pending';

    public const STATUS_SKIPPED = 'skipped';

    public const STATUS_QUEUED = 'queued';

    public const STATUS_SENT = 'sent';

    public const STATUS_FAILED = 'failed';

    public const KIND_CREATED = 'created';

    public const KIND_UPDATED = 'updated';

    protected $fillable = [
        'sale_id',
        'revision_number',
        'kind',
        'before_snapshot',
        'after_snapshot',
        'changes',
        'recipient_email',
        'delivery_status',
        'approved_at',
        'queued_at',
        'sent_at',
        'failure_message',
    ];

    protected function casts(): array
    {
        return [
            'sale_id' => 'integer',
            'revision_number' => 'integer',
            'before_snapshot' => 'array',
            'after_snapshot' => 'array',
            'changes' => 'array',
            'approved_at' => 'datetime',
            'queued_at' => 'datetime',
            'sent_at' => 'datetime',
        ];
    }

    public function sale(): BelongsTo
    {
        return $this->belongsTo(Sale::class);
    }
}
