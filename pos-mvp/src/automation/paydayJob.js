import cron from 'node-cron';
import { db } from '../../db.js';

// Askar Supermarket BenefitPay Coordinates
export const BENEFIT_PAY_CONFIG = {
  mobile: '+973 33843855',
  accountName: 'layali sbi',
  iban: 'BH77SBIN02740045310001',
  storeNameAr: 'أسواق عسكر',
  storeNameEn: 'Askar Supermarket',
  pwaBaseUrl: 'https://askar-khata-pwa.vercel.app'
};

/**
 * Normalizes phone numbers to WhatsApp international format (E.164 digits without +)
 * Handles Bahrain 8-digit mobiles by prefixing '973'.
 */
export function normalizeBahrainWhatsAppPhone(rawPhone) {
  if (!rawPhone) return null;
  let cleaned = String(rawPhone).replace(/[^\d]/g, '');
  if (!cleaned) return null;
  if (cleaned.startsWith('00973')) {
    cleaned = cleaned.slice(2);
  }
  if (cleaned.startsWith('973')) {
    return cleaned;
  }
  if (cleaned.length === 8) {
    return `973${cleaned}`;
  }
  return cleaned;
}

/**
 * Generates standard bilingual BenefitPay Fawri+ reminder text
 */
export function buildFawriPlusReminderMessage(customerName, balanceBhd, statementUrl) {
  const formattedBalance = Number(balanceBhd || 0).toFixed(3);
  return (
    `مرحباً ${customerName}، تحية طيبة من ${BENEFIT_PAY_CONFIG.storeNameAr} 🛒\n` +
    `نود تذكيركم بأن رصيد حسابكم الآجل الحالي هو: ${formattedBalance} د.ب.\n\n` +
    `يرجى التكرم بالسداد عبر تطبيق بنفت بي (BenefitPay Fawri+):\n` +
    `📱 رقم الهاتف: ${BENEFIT_PAY_CONFIG.mobile} (${BENEFIT_PAY_CONFIG.accountName})\n` +
    `🏦 الآيبان (IBAN): ${BENEFIT_PAY_CONFIG.iban}\n` +
    `🔗 كشف الحساب المباشر:\n${statementUrl}\n\n` +
    `شاكرين لكم حسن تعاونكم الدائم 🙏\n` +
    `-----------------------------------------\n` +
    `Dear ${customerName}, greetings from ${BENEFIT_PAY_CONFIG.storeNameEn}.\n` +
    `Your outstanding grocery balance is: BD ${formattedBalance}.\n\n` +
    `Please settle via BenefitPay Fawri+:\n` +
    `Mobile: ${BENEFIT_PAY_CONFIG.mobile} (${BENEFIT_PAY_CONFIG.accountName})\n` +
    `IBAN: ${BENEFIT_PAY_CONFIG.iban}\n` +
    `Live Statement:\n${statementUrl}\n\n` +
    `Thank you for your valued patronage!`
  );
}

/**
 * Evaluates all customer khata accounts with outstanding balances.
 * Compiles a 1-click Payday recovery batch.
 */
export async function generatePaydayBatch(options = {}) {
  const { minBalance = 0.001 } = options;

  try {
    const res = await db.execute({
      sql: `
        SELECT id, name, phone, cpr, balance, credit_limit, updatedAt
        FROM Customer
        WHERE balance >= ?
        ORDER BY balance DESC
      `,
      args: [minBalance]
    });

    const customers = res.rows || [];
    let totalOutstanding = 0;

    const debtors = customers.map((c) => {
      const balanceNum = Number(c.balance || 0);
      totalOutstanding += balanceNum;

      const normalizedPhone = normalizeBahrainWhatsAppPhone(c.phone);
      const statementUrl = `${BENEFIT_PAY_CONFIG.pwaBaseUrl}/customer?id=${encodeURIComponent(c.id)}`;
      const message = buildFawriPlusReminderMessage(c.name || 'Customer', balanceNum, statementUrl);
      const whatsappUrl = normalizedPhone
        ? `https://wa.me/${normalizedPhone}?text=${encodeURIComponent(message)}`
        : null;

      return {
        id: c.id,
        name: c.name || 'Unnamed Account',
        phone: c.phone || null,
        normalizedPhone,
        cpr: c.cpr || null,
        balance: balanceNum,
        balanceFormatted: `${balanceNum.toFixed(3)} BHD`,
        creditLimit: Number(c.credit_limit || 0),
        statementUrl,
        message,
        whatsappUrl,
        canSendWhatsApp: Boolean(normalizedPhone),
        updatedAt: c.updatedAt || null
      };
    });

    return {
      success: true,
      generatedAt: new Date().toISOString(),
      paydayPeriod: new Intl.DateTimeFormat('en-BH', { month: 'long', year: 'numeric' }).format(new Date()),
      totalDebtors: debtors.length,
      totalOutstandingBhd: Number(totalOutstanding.toFixed(3)),
      totalOutstandingFormatted: `${totalOutstanding.toFixed(3)} BHD`,
      benefitPayCoordinates: BENEFIT_PAY_CONFIG,
      debtors
    };
  } catch (error) {
    console.error('❌ Failed to compile Payday Debt Recovery Batch:', error);
    throw error;
  }
}

/**
 * Registers the monthly automated cron job.
 * Runs on the 28th of every month at 9:00 AM AST.
 */
export function startPaydayCron() {
  // Cron schedule: 9:00 AM on the 28th of every month ('0 9 28 * *')
  cron.schedule('0 9 28 * *', async () => {
    try {
      console.log('📅 [Payday Recovery Engine] Starting scheduled 28th-of-month debt recovery cycle...');
      const batch = await generatePaydayBatch();
      console.log(
        `📢 [Payday Recovery Engine] Batch Ready: ${batch.totalDebtors} debtors, Total: BD ${batch.totalOutstandingBhd}`
      );
    } catch (err) {
      console.error('❌ Error during scheduled Payday Cron execution:', err);
    }
  });

  console.log('✅ Automated Payday Fawri+ Debt Recovery Cron Registered (Runs 28th of each month at 9:00 AM)');
}
