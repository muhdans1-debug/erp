#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/b9cc7e6087891a2bad7121bf95368aa72f285e9b7c3959e1f1d9fed9da9a5060/contract';
import endContract from '../../snapshots/b9cc7e6087891a2bad7121bf95368aa72f285e9b7c3959e1f1d9fed9da9a5060/contract.json' with { type: 'json' };
import { Migration, MigrationCLI } from '@prisma/orm-sqlite/migration';

export default class M extends Migration<never, End> {
  override readonly endContractJson = endContract;

  override get operations() {
    return [];
  }
}

MigrationCLI.run(import.meta.url, M);
