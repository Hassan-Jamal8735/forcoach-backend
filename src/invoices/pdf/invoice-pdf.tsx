import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import type { Tables } from '../../supabase/types/database.types';

type Invoice = Tables<'invoices'>;
type LineItem = Tables<'invoice_line_items'>;

export type InvoicePdfCoach = {
  fullName: string;
  email: string;
  siret: string | null;
};

export type CurrencyCode = 'EUR' | 'USD';

const CHARCOAL = '#1c1c1c';
const MUTED = '#6e5f5c';
const BORDER = '#e4e0dd';
const BG_SOFT = '#f7f6f4';

const styles = StyleSheet.create({
  page: {
    padding: 48,
    fontSize: 10,
    color: CHARCOAL,
    fontFamily: 'Helvetica',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 32,
  },
  brand: {
    fontSize: 20,
    fontFamily: 'Helvetica-Bold',
    letterSpacing: 1,
  },
  brandTagline: {
    fontSize: 8,
    color: MUTED,
    marginTop: 2,
  },
  invoiceTitle: {
    fontSize: 16,
    fontFamily: 'Helvetica-Bold',
    textAlign: 'right',
  },
  invoiceMetaText: {
    fontSize: 9,
    color: MUTED,
    textAlign: 'right',
    marginTop: 2,
  },
  partiesRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 28,
  },
  partyBlock: {
    width: '45%',
  },
  partyLabel: {
    fontSize: 8,
    color: MUTED,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  partyName: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 2,
  },
  partyLine: {
    fontSize: 9,
    color: MUTED,
    marginBottom: 1,
  },
  metaGrid: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: BORDER,
    paddingVertical: 10,
    marginBottom: 24,
  },
  metaCell: {
    flex: 1,
  },
  metaCellLabel: {
    fontSize: 8,
    color: MUTED,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 3,
  },
  metaCellValue: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
  },
  table: {
    marginBottom: 20,
  },
  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: BG_SOFT,
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderColor: BORDER,
  },
  colDate: { width: '18%' },
  colTitle: { width: '40%' },
  colHours: { width: '14%', textAlign: 'right' },
  colRate: { width: '14%', textAlign: 'right' },
  colAmount: { width: '14%', textAlign: 'right' },
  tableHeaderText: {
    fontSize: 8,
    color: MUTED,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  tableCellText: {
    fontSize: 9,
  },
  summary: {
    alignSelf: 'flex-end',
    width: '45%',
    marginBottom: 32,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  summaryLabel: {
    fontSize: 9,
    color: MUTED,
  },
  summaryValue: {
    fontSize: 9,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 8,
    marginTop: 4,
    borderTopWidth: 1,
    borderColor: CHARCOAL,
  },
  totalLabel: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
  },
  totalValue: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
  },
  notes: {
    fontSize: 9,
    color: MUTED,
    marginBottom: 24,
  },
  footer: {
    position: 'absolute',
    bottom: 36,
    left: 48,
    right: 48,
    fontSize: 8,
    color: MUTED,
    textAlign: 'center',
    borderTopWidth: 1,
    borderColor: BORDER,
    paddingTop: 10,
  },
});

// Matches the web app's formatter so an invoice reads the same on screen
// and in the PDF.
function makeCurrencyFormatter(currency: CurrencyCode) {
  return (value: number): string =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(
      value,
    );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}

export function InvoicePdf({
  invoice,
  lineItems,
  coach,
  currency = 'EUR',
}: {
  invoice: Invoice;
  lineItems: LineItem[];
  coach: InvoicePdfCoach;
  currency?: CurrencyCode;
}) {
  const formatCurrency = makeCurrencyFormatter(currency);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.brand}>FORCOACH</Text>
            <Text style={styles.brandTagline}>Coaching invoice</Text>
          </View>
          <View>
            <Text style={styles.invoiceTitle}>
              {invoice.invoice_number ?? 'DRAFT'}
            </Text>
            {invoice.issue_date && (
              <Text style={styles.invoiceMetaText}>
                Issued {formatDate(invoice.issue_date)}
              </Text>
            )}
          </View>
        </View>

        <View style={styles.partiesRow}>
          <View style={styles.partyBlock}>
            <Text style={styles.partyLabel}>From</Text>
            <Text style={styles.partyName}>{coach.fullName || coach.email}</Text>
            {coach.siret && (
              <Text style={styles.partyLine}>SIRET: {coach.siret}</Text>
            )}
            <Text style={styles.partyLine}>{coach.email}</Text>
          </View>
          <View style={styles.partyBlock}>
            <Text style={styles.partyLabel}>Billed to</Text>
            <Text style={styles.partyName}>{invoice.studio_name}</Text>
          </View>
        </View>

        <View style={styles.metaGrid}>
          <View style={styles.metaCell}>
            <Text style={styles.metaCellLabel}>Period</Text>
            <Text style={styles.metaCellValue}>
              {formatDate(invoice.period_start)} - {formatDate(invoice.period_end)}
            </Text>
          </View>
          <View style={styles.metaCell}>
            <Text style={styles.metaCellLabel}>Due date</Text>
            <Text style={styles.metaCellValue}>
              {formatDate(invoice.due_date)}
            </Text>
          </View>
          <View style={styles.metaCell}>
            <Text style={styles.metaCellLabel}>Status</Text>
            <Text style={styles.metaCellValue}>
              {invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1)}
            </Text>
          </View>
        </View>

        <View style={styles.table}>
          <View style={styles.tableHeaderRow}>
            <Text style={[styles.tableHeaderText, styles.colDate]}>Date</Text>
            <Text style={[styles.tableHeaderText, styles.colTitle]}>Class</Text>
            <Text style={[styles.tableHeaderText, styles.colHours]}>Hours</Text>
            <Text style={[styles.tableHeaderText, styles.colRate]}>Rate</Text>
            <Text style={[styles.tableHeaderText, styles.colAmount]}>Amount</Text>
          </View>
          {lineItems.map((item) => (
            <View key={item.id} style={styles.tableRow}>
              <Text style={[styles.tableCellText, styles.colDate]}>
                {formatDate(item.event_date)}
              </Text>
              <Text style={[styles.tableCellText, styles.colTitle]}>
                {item.title}
              </Text>
              <Text style={[styles.tableCellText, styles.colHours]}>
                {item.compensation_type === 'hourly'
                  ? item.hours.toFixed(2)
                  : '-'}
              </Text>
              <Text style={[styles.tableCellText, styles.colRate]}>
                {formatCurrency(item.rate)}
                {item.compensation_type === 'hourly' ? '/h' : ''}
              </Text>
              <Text style={[styles.tableCellText, styles.colAmount]}>
                {formatCurrency(item.amount)}
              </Text>
            </View>
          ))}
        </View>

        <View style={styles.summary}>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Subtotal</Text>
            <Text style={styles.summaryValue}>
              {formatCurrency(invoice.subtotal)}
            </Text>
          </View>
          {invoice.vat_rate != null && (
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>
                VAT ({invoice.vat_rate}%)
              </Text>
              <Text style={styles.summaryValue}>
                {formatCurrency(invoice.vat_amount)}
              </Text>
            </View>
          )}
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>
              {formatCurrency(invoice.total)}
            </Text>
          </View>
        </View>

        {invoice.notes && <Text style={styles.notes}>{invoice.notes}</Text>}

        <Text style={styles.footer}>
          {coach.fullName || coach.email}
          {coach.siret ? ` · SIRET ${coach.siret}` : ''} · Generated with
          FORCOACH
        </Text>
      </Page>
    </Document>
  );
}
