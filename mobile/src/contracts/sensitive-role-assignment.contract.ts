import { sensitiveRoleAdditionMessage } from '@/src/components/SensitiveAccessPanel';
import type { CustomerPayload, UserRoleAssignmentPayload } from '@/src/lib/api';
import type { Role } from '@/src/types';

const sensitiveRole: Role = {
  id: 7,
  name: 'Finance Approvers',
  sensitive_permissions: ['approvals-payments'],
};

const acknowledgedRoleUpdate: UserRoleAssignmentPayload = {
  roles: [sensitiveRole.id],
  acknowledged: true,
};

const acknowledgedCustomerUser: CustomerPayload = {
  customer_group_id: 1,
  name: 'Customer',
  phone_number: '01700000000',
  address: 'Dhaka',
  city: 'Dhaka',
  create_user: true,
  acknowledged: true,
};

void sensitiveRoleAdditionMessage([sensitiveRole]);
void acknowledgedRoleUpdate;
void acknowledgedCustomerUser;
