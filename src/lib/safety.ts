interface SafetyCheckInput {
  action: string;
  isDestructive: boolean;
  bulkCount: number;
  confirmationToken?: string;
}

export function enforceWriteSafety(input: SafetyCheckInput): void {
  if (!input.isDestructive && input.bulkCount <= 5) {
    return;
  }

  if (input.confirmationToken !== "CONFIRM") {
    throw new Error(
      `${input.action} requires explicit confirmation. Re-submit with confirmationToken=CONFIRM`,
    );
  }
}
