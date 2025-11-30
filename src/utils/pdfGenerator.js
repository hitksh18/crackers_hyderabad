import { jsPDF } from 'jspdf';

const COLORS = {
  primary: [107, 15, 15],
  secondary: [139, 69, 69],
  accent: [248, 195, 48],
  textDark: [33, 33, 33],
  textMedium: [85, 85, 85],
  textLight: [120, 120, 120],
  white: [255, 255, 255],
  lightBg: [250, 250, 250],
  tableBg: [248, 248, 248],
  border: [200, 200, 200],
  success: [34, 139, 34],
  pending: [255, 140, 0],
};

const MARGINS = {
  left: 15,
  right: 15,
  top: 15,
  bottom: 15,
};

const PAGE_WIDTH = 210;
const CONTENT_WIDTH = PAGE_WIDTH - MARGINS.left - MARGINS.right;

export const generateInvoicePDF = (order, customerInfo, options = {}) => {
  const doc = new jsPDF();
  const { isAdmin = false } = options;
  
  let yPos = MARGINS.top;
  
  const drawFrame = () => {
    doc.setDrawColor(...COLORS.primary);
    doc.setLineWidth(1.5);
    doc.rect(10, 10, 190, 277);
    
    doc.setDrawColor(...COLORS.accent);
    doc.setLineWidth(0.5);
    doc.rect(12, 12, 186, 273);
  };
  
  drawFrame();
  
  yPos = 20;
  
  doc.setFillColor(...COLORS.primary);
  doc.rect(MARGINS.left, yPos, CONTENT_WIDTH, 28, 'F');
  
  doc.setFillColor(...COLORS.accent);
  doc.rect(MARGINS.left, yPos + 25, CONTENT_WIDTH, 3, 'F');
  
  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.white);
  doc.text('CRACKERS HYDERABAD', PAGE_WIDTH / 2, yPos + 12, { align: 'center' });
  
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...COLORS.accent);
  doc.text('Standard Fireworks Exclusive Store', PAGE_WIDTH / 2, yPos + 20, { align: 'center' });
  
  yPos = 56;
  
  doc.setFillColor(...COLORS.lightBg);
  doc.rect(MARGINS.left, yPos, CONTENT_WIDTH, 22, 'F');
  
  doc.setDrawColor(...COLORS.border);
  doc.setLineWidth(0.3);
  doc.rect(MARGINS.left, yPos, CONTENT_WIDTH, 22);
  
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.primary);
  doc.text('TAX INVOICE', PAGE_WIDTH / 2, yPos + 9, { align: 'center' });
  
  const orderDate = order.createdAt?.toDate?.() 
    ? order.createdAt.toDate().toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })
    : new Date().toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      });
  
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...COLORS.textMedium);
  
  const orderId = order.orderId || order.id || 'N/A';
  const displayOrderId = orderId.length > 6 ? orderId.slice(-6).toUpperCase() : orderId.toUpperCase();
  
  doc.text(`Order ID: #${displayOrderId}`, MARGINS.left + 5, yPos + 17);
  doc.text(`Date: ${orderDate}`, MARGINS.left + CONTENT_WIDTH - 5, yPos + 17, { align: 'right' });
  
  yPos = 84;
  
  doc.setFillColor(...COLORS.primary);
  doc.rect(MARGINS.left, yPos, CONTENT_WIDTH / 2 - 3, 8, 'F');
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.white);
  doc.text('CUSTOMER DETAILS', MARGINS.left + 5, yPos + 5.5);
  
  const customerBoxTop = yPos + 10;
  doc.setDrawColor(...COLORS.border);
  doc.setLineWidth(0.3);
  doc.rect(MARGINS.left, customerBoxTop, CONTENT_WIDTH / 2 - 3, 38);
  
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...COLORS.textDark);
  
  let custY = customerBoxTop + 7;
  
  doc.setFont('helvetica', 'bold');
  doc.text('Name:', MARGINS.left + 4, custY);
  doc.setFont('helvetica', 'normal');
  doc.text(customerInfo?.name || 'N/A', MARGINS.left + 20, custY);
  
  custY += 7;
  doc.setFont('helvetica', 'bold');
  doc.text('Phone:', MARGINS.left + 4, custY);
  doc.setFont('helvetica', 'normal');
  doc.text(customerInfo?.phone || 'N/A', MARGINS.left + 20, custY);
  
  custY += 7;
  if (customerInfo?.email) {
    doc.setFont('helvetica', 'bold');
    doc.text('Email:', MARGINS.left + 4, custY);
    doc.setFont('helvetica', 'normal');
    const email = customerInfo.email.length > 28 ? customerInfo.email.substring(0, 25) + '...' : customerInfo.email;
    doc.text(email, MARGINS.left + 20, custY);
    custY += 7;
  }
  
  if (customerInfo?.address) {
    doc.setFont('helvetica', 'bold');
    doc.text('Address:', MARGINS.left + 4, custY);
    doc.setFont('helvetica', 'normal');
    
    const fullAddress = `${customerInfo.address}`;
    const cityPincode = `${customerInfo.city || ''} - ${customerInfo.pincode || ''}`;
    
    const addressMaxWidth = 65;
    const addressLines = doc.splitTextToSize(fullAddress, addressMaxWidth);
    
    doc.text(addressLines[0] || '', MARGINS.left + 20, custY);
    if (addressLines[1]) {
      custY += 5;
      doc.text(addressLines[1], MARGINS.left + 20, custY);
    }
    custY += 5;
    doc.text(cityPincode.trim(), MARGINS.left + 20, custY);
  }
  
  const orderInfoX = MARGINS.left + CONTENT_WIDTH / 2 + 3;
  
  doc.setFillColor(...COLORS.secondary);
  doc.rect(orderInfoX, yPos, CONTENT_WIDTH / 2 - 3, 8, 'F');
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.white);
  doc.text('ORDER INFORMATION', orderInfoX + 5, yPos + 5.5);
  
  doc.setDrawColor(...COLORS.border);
  doc.rect(orderInfoX, customerBoxTop, CONTENT_WIDTH / 2 - 3, 38);
  
  let orderY = customerBoxTop + 7;
  doc.setFontSize(9);
  
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.textDark);
  doc.text('Payment:', orderInfoX + 4, orderY);
  doc.setFont('helvetica', 'normal');
  
  const paymentStatus = order.paymentMode || order.paymentStatus || 'Pending';
  if (paymentStatus.toLowerCase() === 'pending' || paymentStatus.toLowerCase() === 'cod') {
    doc.setTextColor(...COLORS.pending);
  } else {
    doc.setTextColor(...COLORS.success);
  }
  doc.text(paymentStatus, orderInfoX + 24, orderY);
  
  orderY += 7;
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.textDark);
  doc.text('Status:', orderInfoX + 4, orderY);
  doc.setFont('helvetica', 'normal');
  
  const orderStatus = order.status || 'Pending';
  if (orderStatus.toLowerCase() === 'delivered') {
    doc.setTextColor(...COLORS.success);
  } else if (orderStatus.toLowerCase() === 'cancelled') {
    doc.setTextColor(200, 0, 0);
  } else {
    doc.setTextColor(...COLORS.pending);
  }
  doc.text(orderStatus, orderInfoX + 24, orderY);
  
  orderY += 7;
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.textDark);
  doc.text('Delivery:', orderInfoX + 4, orderY);
  doc.setFont('helvetica', 'normal');
  doc.text(order.deliveryNote || 'As per availability', orderInfoX + 24, orderY);
  
  if (order.discount && order.discount > 0) {
    orderY += 7;
    doc.setFont('helvetica', 'bold');
    doc.text('Discount:', orderInfoX + 4, orderY);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...COLORS.success);
    doc.text(`- Rs ${order.discount}`, orderInfoX + 24, orderY);
  }
  
  yPos = 138;
  
  doc.setFillColor(...COLORS.primary);
  doc.rect(MARGINS.left, yPos, CONTENT_WIDTH, 8, 'F');
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.white);
  doc.text('ORDER ITEMS', MARGINS.left + 5, yPos + 5.5);
  
  yPos += 10;
  
  const colWidths = {
    sno: 12,
    item: 88,
    qty: 20,
    price: 30,
    total: 30,
  };
  
  doc.setFillColor(...COLORS.tableBg);
  doc.rect(MARGINS.left, yPos, CONTENT_WIDTH, 8, 'F');
  doc.setDrawColor(...COLORS.border);
  doc.setLineWidth(0.3);
  doc.rect(MARGINS.left, yPos, CONTENT_WIDTH, 8);
  
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.textDark);
  
  let colX = MARGINS.left;
  doc.text('S.No', colX + 2, yPos + 5.5);
  colX += colWidths.sno;
  
  doc.line(colX, yPos, colX, yPos + 8);
  doc.text('Item Description', colX + 2, yPos + 5.5);
  colX += colWidths.item;
  
  doc.line(colX, yPos, colX, yPos + 8);
  doc.text('Qty', colX + 2, yPos + 5.5);
  colX += colWidths.qty;
  
  doc.line(colX, yPos, colX, yPos + 8);
  doc.text('Price', colX + 2, yPos + 5.5);
  colX += colWidths.price;
  
  doc.line(colX, yPos, colX, yPos + 8);
  doc.text('Total', colX + 2, yPos + 5.5);
  
  yPos += 8;
  
  const items = order.items || [];
  let subtotal = 0;
  const itemRowHeight = 7;
  
  items.forEach((item, index) => {
    const itemPrice = item.discountPrice || item.onlinePrice || item.price || 0;
    const itemTotal = itemPrice * item.quantity;
    subtotal += itemTotal;
    
    if (yPos > 235) {
      doc.addPage();
      drawFrame();
      yPos = 25;
      
      doc.setFillColor(...COLORS.tableBg);
      doc.rect(MARGINS.left, yPos, CONTENT_WIDTH, 8, 'F');
      doc.setDrawColor(...COLORS.border);
      doc.rect(MARGINS.left, yPos, CONTENT_WIDTH, 8);
      
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...COLORS.textDark);
      
      let hColX = MARGINS.left;
      doc.text('S.No', hColX + 2, yPos + 5.5);
      hColX += colWidths.sno;
      doc.line(hColX, yPos, hColX, yPos + 8);
      doc.text('Item Description', hColX + 2, yPos + 5.5);
      hColX += colWidths.item;
      doc.line(hColX, yPos, hColX, yPos + 8);
      doc.text('Qty', hColX + 2, yPos + 5.5);
      hColX += colWidths.qty;
      doc.line(hColX, yPos, hColX, yPos + 8);
      doc.text('Price', hColX + 2, yPos + 5.5);
      hColX += colWidths.price;
      doc.line(hColX, yPos, hColX, yPos + 8);
      doc.text('Total', hColX + 2, yPos + 5.5);
      
      yPos += 8;
    }
    
    if (index % 2 === 0) {
      doc.setFillColor(252, 252, 252);
      doc.rect(MARGINS.left, yPos, CONTENT_WIDTH, itemRowHeight, 'F');
    }
    
    doc.setDrawColor(...COLORS.border);
    doc.setLineWidth(0.2);
    doc.rect(MARGINS.left, yPos, CONTENT_WIDTH, itemRowHeight);
    
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...COLORS.textDark);
    
    let rowColX = MARGINS.left;
    doc.text(`${index + 1}`, rowColX + 4, yPos + 5);
    rowColX += colWidths.sno;
    
    doc.line(rowColX, yPos, rowColX, yPos + itemRowHeight);
    const itemName = item.name.length > 45 ? item.name.substring(0, 42) + '...' : item.name;
    doc.text(itemName, rowColX + 2, yPos + 5);
    rowColX += colWidths.item;
    
    doc.line(rowColX, yPos, rowColX, yPos + itemRowHeight);
    doc.text(`${item.quantity}`, rowColX + 8, yPos + 5, { align: 'center' });
    rowColX += colWidths.qty;
    
    doc.line(rowColX, yPos, rowColX, yPos + itemRowHeight);
    doc.text(`Rs ${itemPrice.toFixed(0)}`, rowColX + colWidths.price - 3, yPos + 5, { align: 'right' });
    rowColX += colWidths.price;
    
    doc.line(rowColX, yPos, rowColX, yPos + itemRowHeight);
    doc.setFont('helvetica', 'bold');
    doc.text(`Rs ${itemTotal.toFixed(0)}`, rowColX + colWidths.total - 3, yPos + 5, { align: 'right' });
    
    yPos += itemRowHeight;
  });
  
  yPos += 3;
  
  doc.setDrawColor(...COLORS.primary);
  doc.setLineWidth(0.8);
  doc.line(MARGINS.left, yPos, MARGINS.left + CONTENT_WIDTH, yPos);
  
  yPos += 5;
  
  const totalBoxX = MARGINS.left + CONTENT_WIDTH - 75;
  
  if (order.discount && order.discount > 0) {
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...COLORS.textMedium);
    doc.text('Subtotal:', totalBoxX, yPos);
    doc.text(`Rs ${(subtotal + order.discount).toFixed(0)}`, MARGINS.left + CONTENT_WIDTH - 3, yPos, { align: 'right' });
    
    yPos += 6;
    doc.setTextColor(...COLORS.success);
    doc.text('Discount:', totalBoxX, yPos);
    doc.text(`- Rs ${order.discount}`, MARGINS.left + CONTENT_WIDTH - 3, yPos, { align: 'right' });
    
    yPos += 6;
  }
  
  const totalAmount = order.total || subtotal;
  
  doc.setFillColor(...COLORS.primary);
  doc.rect(totalBoxX - 5, yPos - 1, 80, 12, 'F');
  
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.white);
  doc.text('GRAND TOTAL:', totalBoxX, yPos + 7);
  doc.text(`Rs ${totalAmount.toFixed(0)}`, MARGINS.left + CONTENT_WIDTH - 5, yPos + 7, { align: 'right' });
  
  yPos += 20;
  
  if (order.notes || order.message) {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...COLORS.primary);
    doc.text('Order Notes:', MARGINS.left, yPos);
    
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...COLORS.textMedium);
    const noteText = order.notes || order.message;
    const noteLines = doc.splitTextToSize(noteText, CONTENT_WIDTH);
    doc.text(noteLines, MARGINS.left, yPos + 5);
    yPos += 5 + (noteLines.length * 4);
  }
  
  const footerY = 260;
  
  doc.setDrawColor(...COLORS.accent);
  doc.setLineWidth(1);
  doc.line(MARGINS.left, footerY, MARGINS.left + CONTENT_WIDTH, footerY);
  
  doc.setFillColor(...COLORS.lightBg);
  doc.rect(MARGINS.left, footerY + 1, CONTENT_WIDTH, 22, 'F');
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.primary);
  doc.text('Thank you for shopping with Crackers Hyderabad!', PAGE_WIDTH / 2, footerY + 7, { align: 'center' });
  
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...COLORS.textMedium);
  doc.text('For support, contact us via WhatsApp or visit our store', PAGE_WIDTH / 2, footerY + 13, { align: 'center' });
  doc.text('Hyderabad, Telangana | www.crackershyderabad.com', PAGE_WIDTH / 2, footerY + 18, { align: 'center' });
  
  if (isAdmin) {
    doc.setFontSize(7);
    doc.setTextColor(...COLORS.textLight);
    doc.text('Admin Generated Copy', MARGINS.left + CONTENT_WIDTH, 287, { align: 'right' });
  }
  
  return doc;
};

export const generateInvoicePDFBlob = (order, customerInfo, options = {}) => {
  const doc = generateInvoicePDF(order, customerInfo, options);
  return doc.output('blob');
};

export const downloadInvoicePDF = (order, customerInfo, options = {}) => {
  const doc = generateInvoicePDF(order, customerInfo, options);
  const orderId = order.orderId || order.id || 'ORDER';
  const displayOrderId = orderId.length > 6 ? orderId.slice(-6).toUpperCase() : orderId.toUpperCase();
  doc.save(`Invoice_${displayOrderId}.pdf`);
};
