<div align="center">

# <span style="color:#ff3b30">CRACKERS</span> HYDERABAD

### Premium Fireworks E-Commerce Platform

<p>
  <a href="https://crackershyderabad.com">
    <img src="https://img.shields.io/badge/Store-crackershyderabad.com-111111?style=for-the-badge&logo=googlechrome&logoColor=white" />
  </a>
  <a href="https://admin.crackershyderabad.com">
    <img src="https://img.shields.io/badge/Admin-Console-111111?style=for-the-badge&logo=shield&logoColor=white" />
  </a>
  <a href="https://billing.crackershyderabad.com">
    <img src="https://img.shields.io/badge/Billing-POS-111111?style=for-the-badge&logo=cashapp&logoColor=white" />
  </a>
</p>

<p>
  <img src="https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=111111" />
  <img src="https://img.shields.io/badge/Vite-7-646CFF?style=flat-square&logo=vite&logoColor=white" />
  <img src="https://img.shields.io/badge/Node.js-22-339933?style=flat-square&logo=nodedotjs&logoColor=white" />
  <img src="https://img.shields.io/badge/Express-5-000000?style=flat-square&logo=express&logoColor=white" />
  <img src="https://img.shields.io/badge/Firebase-Auth%20%2B%20Firestore-FFCA28?style=flat-square&logo=firebase&logoColor=111111" />
  <img src="https://img.shields.io/badge/Nginx-Production-009639?style=flat-square&logo=nginx&logoColor=white" />
</p>

</div>

---

## About

**Crackers Hyderabad** is a production-ready e-commerce platform built for the online sale of standard fireworks.

The platform combines a modern customer storefront with dedicated staff applications for administration and counter billing, all connected through a shared Express backend and Firebase infrastructure.

> **One codebase. Three applications. One centralized backend.**

---

## Platform

<table>
<tr>
<td width="33%" align="center">

### Storefront

Customer-facing shopping experience.

<a href="https://crackershyderabad.com">
<img src="https://img.shields.io/badge/OPEN-Store-ff3b30?style=for-the-badge" />
</a>

</td>

<td width="33%" align="center">

### Admin Console

Orders, products, users and analytics.

<a href="https://admin.crackershyderabad.com">
<img src="https://img.shields.io/badge/OPEN-Admin-111111?style=for-the-badge" />
</a>

</td>

<td width="33%" align="center">

### Billing POS

Counter sales and invoice management.

<a href="https://billing.crackershyderabad.com">
<img src="https://img.shields.io/badge/OPEN-Billing-555555?style=for-the-badge" />
</a>

</td>
</tr>
</table>

---

# Architecture

```text
                         INTERNET
                             |
                             v
                    +------------------+
                    |       NGINX      |
                    | Reverse Proxy    |
                    +--------+---------+
                             |
          +------------------+------------------+
          |                  |                  |
          v                  v                  v
   crackershyderabad   admin.crackers...  billing.crackers...
       STOREFRONT          ADMIN               BILLING
          |                  |                  |
          +------------------+------------------+
                             |
                             v
                    +------------------+
                    |   EXPRESS API    |
                    |     :3001        |
                    +--------+---------+
                             |
              +--------------+--------------+
              |              |              |
              v              v              v
          FIREBASE         MEDIA          BUSINESS
       AUTH / FIRESTORE    STORAGE          LOGIC
