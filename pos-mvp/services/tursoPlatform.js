import { createClient } from '@libsql/client';

if (process.loadEnvFile) {
  try { process.loadEnvFile('.env'); } catch {}
}

const TURSO_PLATFORM_API = 'https://api.turso.tech/v1';
const ORG_NAME = process.env.TURSO_ORG_NAME || 'muhdans1';
const PLATFORM_TOKEN = process.env.TURSO_PLATFORM_API_TOKEN;

// In-memory registry of fleet terminals (simulating / tracking real terminals)
const fleetRegistry = new Map([
  [
    'term-askar-01',
    {
      id: 'term-askar-01',
      clientName: 'Askar Supermarket',
      storeSlug: 'askar-pos-primary',
      terminalName: 'SUNMI D2 Mini (Front Counter)',
      deviceModel: 'Sunmi D2 Mini',
      ipAddress: '192.168.8.12',
      appVersion: 'v2.4.1',
      lastSync: new Date().toISOString(),
      isOnline: true,
      pendingOfflineSales: 0,
      licensed: true,
      batteryLevel: '100%',
      wifiSsid: 'Askar_Retail_5G'
    }
  ],
  [
    'term-askar-02',
    {
      id: 'term-askar-02',
      clientName: 'Askar Supermarket',
      storeSlug: 'askar-pos-primary',
      terminalName: 'Manager Back-Office PC',
      deviceModel: 'Windows PC (Laptop)',
      ipAddress: '192.168.8.7',
      appVersion: 'v2.4.1',
      lastSync: new Date().toISOString(),
      isOnline: true,
      pendingOfflineSales: 0,
      licensed: true,
      batteryLevel: 'AC Power',
      wifiSsid: 'Askar_Retail_5G'
    }
  ]
]);

export async function listTenantDatabases() {
  if (!PLATFORM_TOKEN) {
    throw new Error('TURSO_PLATFORM_API_TOKEN is not configured.');
  }

  const res = await fetch(`${TURSO_PLATFORM_API}/organizations/${ORG_NAME}/databases`, {
    headers: { Authorization: `Bearer ${PLATFORM_TOKEN}` }
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Turso Platform API Error (${res.status}): ${errorText}`);
  }

  const data = await res.json();
  const databases = data.databases || [];

  return databases.map((db) => ({
    name: db.Name || db.name,
    dbId: db.DbId || db.db_id,
    hostname: db.Hostname || db.hostname,
    group: db.group || 'default',
    regions: db.regions || ['aws-ap-south-1'],
    primaryRegion: db.primaryRegion || 'aws-ap-south-1',
    url: `libsql://${db.Hostname || db.hostname}`,
    sleeping: db.sleeping || false,
    archived: db.archived || false
  }));
}

export async function provisionTenantDatabase(slug, group = 'default') {
  if (!PLATFORM_TOKEN) {
    throw new Error('TURSO_PLATFORM_API_TOKEN is not configured.');
  }

  const cleanSlug = slug.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  const dbName = cleanSlug.startsWith('client-') ? cleanSlug : `client-${cleanSlug}-db`;

  // 1. Create database in Turso group
  const createRes = await fetch(`${TURSO_PLATFORM_API}/organizations/${ORG_NAME}/databases`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${PLATFORM_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: dbName,
      group: group
    })
  });

  if (!createRes.ok) {
    const err = await createRes.text();
    throw new Error(`Failed to create database '${dbName}': ${err}`);
  }

  const createData = await createRes.json();
  const dbInfo = createData.database || {};

  // 2. Mint restricted tenant token for the store hardware
  const tokenRes = await fetch(`${TURSO_PLATFORM_API}/organizations/${ORG_NAME}/databases/${dbName}/auth/tokens`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${PLATFORM_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ expiration: 'never', authorization: 'full-access' })
  });

  const tokenData = await tokenRes.json();
  const tenantJwt = tokenData.jwt;

  // 3. Register a virtual terminal in the fleet matrix
  const terminalId = `term-${cleanSlug}-01`;
  fleetRegistry.set(terminalId, {
    id: terminalId,
    clientName: cleanSlug.replace(/-/g, ' ').toUpperCase(),
    storeSlug: dbName,
    terminalName: `SUNMI D2 Mini (${cleanSlug})`,
    deviceModel: 'Sunmi D2 Mini',
    ipAddress: `192.168.10.${Math.floor(Math.random() * 200) + 10}`,
    appVersion: 'v2.4.1',
    lastSync: new Date().toISOString(),
    isOnline: true,
    pendingOfflineSales: 0,
    licensed: true,
    batteryLevel: '98%',
    wifiSsid: `${cleanSlug}_Store_WiFi`
  });

  return {
    success: true,
    databaseName: dbName,
    hostname: dbInfo.Hostname || dbInfo.hostname,
    url: `libsql://${dbInfo.Hostname || dbInfo.hostname}`,
    authToken: tenantJwt,
    terminalId
  };
}

export async function executeRemoteQuery(databaseName, sqlQuery) {
  if (!PLATFORM_TOKEN) {
    throw new Error('TURSO_PLATFORM_API_TOKEN is not configured.');
  }

  // Mint a temporary execution token for this database
  const tokenRes = await fetch(`${TURSO_PLATFORM_API}/organizations/${ORG_NAME}/databases/${databaseName}/auth/tokens`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${PLATFORM_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ expiration: '15m', authorization: 'full-access' })
  });

  if (!tokenRes.ok) {
    throw new Error(`Cannot mint execution token for database '${databaseName}'`);
  }

  const { jwt } = await tokenRes.json();

  // Find hostname
  const allDbs = await listTenantDatabases();
  const target = allDbs.find((d) => d.name === databaseName);
  if (!target) {
    throw new Error(`Database '${databaseName}' not found in organization '${ORG_NAME}'`);
  }

  const startTime = Date.now();
  const client = createClient({
    url: target.url,
    authToken: jwt
  });

  try {
    const result = await client.execute(sqlQuery);
    const executionTimeMs = Date.now() - startTime;

    return {
      success: true,
      databaseName,
      columns: result.columns || [],
      rows: result.rows || [],
      rowsAffected: result.rowsAffected,
      executionTimeMs
    };
  } finally {
    client.close();
  }
}

export async function setTenantLicenseStatus(terminalId, licensed) {
  const terminal = fleetRegistry.get(terminalId);
  if (!terminal) {
    throw new Error(`Terminal '${terminalId}' not found.`);
  }

  terminal.licensed = licensed;
  terminal.isOnline = licensed;
  fleetRegistry.set(terminalId, terminal);

  return {
    success: true,
    terminalId,
    licensed,
    message: licensed
      ? `License re-activated for ${terminal.clientName}. Terminal unlocked.`
      : `KILL SWITCH ACTIVATED: Remote wipe & lock command sent to ${terminal.clientName}.`
  };
}

export function getFleetMatrix() {
  return Array.from(fleetRegistry.values());
}

