<div align="center">

# CRACKERS HYDERABAD

### PREMIUM FIREWORKS E-COMMERCE PLATFORM

<p>
A modern commerce platform built for customers, store operations and counter billing.
</p>

<br>

[![STORE](https://img.shields.io/badge/STORE-crackershyderabad.com-FF3038?style=for-the-badge&logo=googlechrome&logoColor=white)](https://crackershyderabad.com)
[![ADMIN](https://img.shields.io/badge/ADMIN-CONSOLE-151515?style=for-the-badge&logo=shield&logoColor=white)](https://admin.crackershyderabad.com)
[![BILLING](https://img.shields.io/badge/BILLING-POS-252525?style=for-the-badge&logo=cashapp&logoColor=white)](https://billing.crackershyderabad.com)

<br>

![React](https://img.shields.io/badge/React_19-61DAFB?style=flat-square&logo=react&logoColor=111111)
![Vite](https://img.shields.io/badge/Vite_7-646CFF?style=flat-square&logo=vite&logoColor=white)
![Node](https://img.shields.io/badge/Node.js_22-339933?style=flat-square&logo=nodedotjs&logoColor=white)
![Express](https://img.shields.io/badge/Express_5-111111?style=flat-square&logo=express&logoColor=white)
![Firebase](https://img.shields.io/badge/Firebase-Auth_%2B_Firestore-FFCA28?style=flat-square&logo=firebase&logoColor=111111)
![Nginx](https://img.shields.io/badge/Nginx-Production-009639?style=flat-square&logo=nginx&logoColor=white)

</div>

---

<div align="center">

## ONE PLATFORM. THREE EXPERIENCES.

</div>

<table>
<tr>
<td align="center" width="33%">

### STOREFRONT

Customer commerce

---

Product catalogue  
Shopping cart  
Checkout  
Order tracking  
Invoices

<br>

[**OPEN STORE →**](https://crackershyderabad.com)

</td>

<td align="center" width="33%">

### ADMIN

Business operations

---

Orders  
Products  
Users  
Analytics  
Pricing

<br>

[**OPEN ADMIN →**](https://admin.crackershyderabad.com)

</td>

<td align="center" width="33%">

### BILLING

Counter operations

---

POS  
Customers  
Orders  
Invoices  
Sales

<br>

[**OPEN BILLING →**](https://billing.crackershyderabad.com)

</td>
</tr>
</table>

---

## PLATFORM

**Crackers Hyderabad** is a production-ready e-commerce platform designed for the online sale of standard fireworks.

The architecture combines three specialized applications with one centralized backend.

```text
                         INTERNET
                            |
                            v
                    +---------------+
                    |     NGINX     |
                    | REVERSE PROXY |
                    +-------+-------+
                            |
            +---------------+---------------+
            |               |               |
            v               v               v
       STOREFRONT         ADMIN          BILLING
       CUSTOMER APP      CONSOLE           POS
            |               |               |
            +---------------+---------------+
                            |
                            v
                    +---------------+
                    |  EXPRESS API  |
                    |     :3001     |
                    +-------+-------+
                            |
             +--------------+--------------+
             |              |              |
             v              v              v
          FIREBASE        MEDIA         BUSINESS
          AUTH / DB       STORAGE         LOGIC
