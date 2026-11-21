import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { ABI } from "./abi";
import {
  Building2,
  Wallet,
  LayoutDashboard,
  FileSignature,
  ShieldCheck,
  History,
  Plus,
  RefreshCw,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Scale,
  Home,
  Copy,
} from "lucide-react";
const ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS;
const RPC = import.meta.env.VITE_INFURA_RPC_URL;
const CHAIN = Number(import.meta.env.VITE_CHAIN_ID || 11155111);
const statuses = [
  "รอยืนยัน",
  "กำลังเช่า",
  "รอตรวจห้อง",
  "มีข้อพิพาท",
  "ปิดสัญญา",
];

const fmt = (v) =>
  Number(ethers.formatEther(v || 0)).toLocaleString("en-US", {
    maximumFractionDigits: 6,
  });
const short = (s) => (s ? `${s.slice(0, 6)}…${s.slice(-4)}` : "-");
const when = (s) =>
  new Date(Number(s) * 1000).toLocaleDateString("th-TH", {
    dateStyle: "medium",
  });
const explorer =
  CHAIN === 11155111 ? "https://sepolia.etherscan.io" : `https://etherscan.io`;
function App() {
  const [tab, setTab] = useState("dashboard"),
    [wallet, setWallet] = useState(""),
    [network, setNetwork] = useState(""),
    [properties, setProperties] = useState([]),
    [agreements, setAgreements] = useState([]),
    [payments, setPayments] = useState([]),
    [arbiter, setArbiter] = useState("");
  const [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [error, setError] = useState("");
  const [propertyForm, setPropertyForm] = useState({
    title: "",
    location: "",
    rent: "0.001",
    deposit: "0.002",
  });
  const [agreementForm, setAgreementForm] = useState({
    propertyId: "",
    tenant: "",
    start: "",
    end: "",
    terms: "",
  });
  const [action, setAction] = useState({ id: "", deduction: "0", reason: "" });
  const ready = ethers.isAddress(ADDRESS || "");
  const read = () => {
    if (!ready || !RPC)
      throw Error(
        "กรุณาตั้งค่า VITE_CONTRACT_ADDRESS และ VITE_INFURA_RPC_URL ใน .env",
      );
    return new ethers.Contract(ADDRESS, ABI, new ethers.JsonRpcProvider(RPC));
  };
  async function load() {
    try {
      const c = read();
      const [pc, ac, judge] = await Promise.all([
        c.propertyCount(),
        c.agreementCount(),
        c.arbiter(),
      ]);
      setArbiter(judge);
      const ps = await Promise.all(
        Array.from({ length: Number(pc) }, (_, i) =>
          c.properties(i + 1).then((p) => ({
            id: i + 1,
            owner: p.owner,
            title: p.title,
            location: p.location,
            rent: p.rent,
            deposit: p.deposit,
          })),
        ),
      );
      setProperties(ps);
      const as = await Promise.all(
        Array.from({ length: Number(ac) }, async (_, i) => {
          const a = await c.agreements(i + 1);
          const [resolution, approved, tenantApproved, count] =
            await Promise.all([
              c.resolutions(i + 1),
              c.inspectionApproved(i + 1),
              c.tenantApprovedDeduction(i + 1),
              c.paymentCount(i + 1),
            ]);
          return {
            id: i + 1,
            propertyId: Number(a.propertyId),
            tenant: a.tenant,
            start: Number(a.start),
            end: Number(a.end),
            termsHash: a.termsHash,
            ownerSigned: a.ownerSigned,
            tenantSigned: a.tenantSigned,
            funded: a.funded,
            status: Number(a.status),
            held: a.depositHeld,
            paidPeriods: Number(a.paidPeriods),
            resolution,
            approved,
            tenantApproved,
            count: Number(count),
          };
        }),
      );
      setAgreements(as);
      const rows = (
        await Promise.all(
          as.map(async (a) =>
            Promise.all(
              Array.from({ length: a.count }, (_, j) =>
                c.getPayment(a.id, j).then((p) => ({
                  id: a.id,
                  amount: p.amount,
                  time: Number(p.timestamp),
                  payer: p.payer,
                })),
              ),
            ),
          ),
        )
      )
        .flat()
        .sort((a, b) => b.time - a.time);
      setPayments(rows);
      setError("");
    } catch (e) {
      setError(e.shortMessage || e.message);
    }
  }
  useEffect(() => {
    load();
    if (window.ethereum) {
      window.ethereum
        .request({ method: "eth_accounts" })
        .then((a) => {
          if (a[0]) setWallet(a[0]);
        })
        .catch(() => {});
      window.ethereum
        .request({ method: "eth_chainId" })
        .then(setNetwork)
        .catch(() => {});
      const change = () => window.location.reload();
      window.ethereum.on?.("accountsChanged", change);
      window.ethereum.on?.("chainChanged", change);
      return () => {
        window.ethereum.removeListener?.("accountsChanged", change);
        window.ethereum.removeListener?.("chainChanged", change);
      };
    }
  }, []);
  async function connect() {
    try {
      if (!window.ethereum) throw Error("กรุณาติดตั้ง MetaMask");
      const a = await window.ethereum.request({
        method: "eth_requestAccounts",
      });
      setWallet(a[0]);
      setNetwork(await window.ethereum.request({ method: "eth_chainId" }));
    } catch (e) {
      setError(e.message);
    }
  }
  async function transact(fn) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (!window.ethereum) throw Error("ไม่พบ MetaMask");
      if (!ready) throw Error("กรุณาตั้งค่า Contract Address");
      const provider = new ethers.BrowserProvider(window.ethereum);
      await provider.send("eth_requestAccounts", []);
      const chain = await provider.getNetwork();
      if (Number(chain.chainId) !== CHAIN)
        throw Error(
          `เครือข่ายไม่ถูกต้อง กรุณาเปลี่ยน MetaMask เป็น Chain ID ${CHAIN}`,
        );
      const c = new ethers.Contract(ADDRESS, ABI, await provider.getSigner());
      const tx = await fn(c);
      setNotice(`ส่งธุรกรรมแล้ว: ${tx.hash} — กำลังรอยืนยัน`);
      await tx.wait();
      setNotice(`ยืนยันธุรกรรมแล้ว: ${tx.hash}`);
      await load();
    } catch (e) {
      setError(e.shortMessage || e.reason || e.message);
    } finally {
      setBusy(false);
    }
  }
  const selected = agreements.find((a) => String(a.id) === String(action.id));
  const selectedProperty = properties.find(
    (p) => p.id === selected?.propertyId,
  );
  const isOwner = (p) =>
    wallet && p.owner.toLowerCase() === wallet.toLowerCase();
  const isTenant = (a) =>
    wallet && a.tenant.toLowerCase() === wallet.toLowerCase();
  const menu = [
    ["dashboard", LayoutDashboard, "ภาพรวม"],
    ["properties", Building2, "อสังหาริมทรัพย์"],
    ["agreements", FileSignature, "สัญญาเช่า"],
    ["actions", ShieldCheck, "จัดการสัญญา"],
    ["payments", History, "ประวัติชำระเงิน"],
  ];
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brandicon">
            <Building2 size={25} />
          </div>
          <div>
            <strong>SmartLiving</strong>
            <small>PROPERTY BLOCKCHAIN</small>
          </div>
        </div>
        <div className="side-label">เมนูหลัก</div>
        <nav>
          {menu.map(([id, Icon, label]) => (
            <button
              key={id}
              className={tab === id ? "active" : ""}
              onClick={() => setTab(id)}
            >
              <Icon size={19} />
              {label}
            </button>
          ))}
        </nav>
        <div className="side-bottom">
          <ShieldCheck size={20} />
          <div>
            <b>Secured by Blockchain</b>
            <small>Transparent • Decentralized</small>
          </div>
        </div>
      </aside>
      <main>
        <header>
          <div>
            <div className="eyebrow">SMART PROPERTY MANAGEMENT</div>
            <h1>{menu.find((x) => x[0] === tab)?.[2]}</h1>
            <p className="muted">
              บริหารสัญญาเช่าและเงินประกันอย่างโปร่งใสด้วย Ethereum
            </p>
          </div>
          <div className="header-actions">
            <span className="network">● Chain ID {CHAIN}</span>
            <button className="btn outline" onClick={load}>
              <RefreshCw size={17} />
            </button>
            <button className="btn primary" onClick={connect}>
              <Wallet size={17} />
              {wallet ? short(wallet) : "เชื่อมต่อ MetaMask"}
            </button>
          </div>
        </header>
        {error && (
          <div className="alert error">
            <AlertCircle size={18} />
            {error}
            <button onClick={() => setError("")}>×</button>
          </div>
        )}
        {notice && (
          <div className="alert success">
            <CheckCircle2 size={18} />
            {notice.startsWith("ส่ง")
              ? "กำลังยืนยันธุรกรรม"
              : "ธุรกรรมสำเร็จ"}{" "}
            {notice.includes("0x") && (
              <a
                href={`${explorer}/tx/${notice.match(/0x[a-fA-F0-9]{64}/)?.[0]}`}
                target="_blank"
                rel="noreferrer"
              >
                ดูบน Etherscan <ExternalLink size={14} />
              </a>
            )}
          </div>
        )}
        {tab === "dashboard" && (
          <>
            <div className="hero">
              <div>
                <span className="hero-kicker">WELCOME TO SMARTLIVING</span>
                <h2>
                  จัดการการเช่าอย่างมั่นใจ
                  <br />
                  ทุกธุรกรรมตรวจสอบได้
                </h2>
                <p>
                  สัญญาและเงินประกันถูกจัดการผ่าน Smart Contract บน Ethereum
                </p>
                <button
                  className="btn white"
                  onClick={() => setTab("properties")}
                >
                  ดูรายการอสังหาริมทรัพย์ →
                </button>
              </div>
              <div className="hero-art">
                <Home size={110} strokeWidth={1.1} />
              </div>
            </div>
            <div className="stats">
              <Stat
                icon={Building2}
                label="อสังหาริมทรัพย์"
                value={properties.length}
                unit="รายการ"
              />
              <Stat
                icon={FileSignature}
                label="สัญญาทั้งหมด"
                value={agreements.length}
                unit="สัญญา"
              />
              <Stat
                icon={ShieldCheck}
                label="เงินประกันที่ล็อก"
                value={fmt(agreements.reduce((s, a) => s + a.held, 0n))}
                unit="ETH"
              />
              <Stat
                icon={History}
                label="ชำระค่าเช่า"
                value={payments.length}
                unit="ครั้ง"
              />
            </div>
            <section className="panel">
              <div className="panel-title">
                <h3>สัญญาล่าสุด</h3>
                <button
                  className="linkbtn"
                  onClick={() => setTab("agreements")}
                >
                  ดูทั้งหมด →
                </button>
              </div>
              <AgreementTable
                agreements={agreements.slice(-5).reverse()}
                properties={properties}
              />
            </section>
          </>
        )}
        {tab === "properties" && (
          <>
            <section className="panel">
              <div className="panel-title">
                <h3>
                  <Plus size={19} /> ลงทะเบียนอสังหาริมทรัพย์
                </h3>
              </div>
              <form
                className="form-grid"
                onSubmit={(e) => {
                  e.preventDefault();
                  transact((c) =>
                    c.registerProperty(
                      propertyForm.title,
                      propertyForm.location,
                      ethers.parseEther(propertyForm.rent),
                      ethers.parseEther(propertyForm.deposit),
                    ),
                  );
                }}
              >
                <Field
                  label="ชื่อห้อง / ทรัพย์สิน"
                  value={propertyForm.title}
                  onChange={(v) =>
                    setPropertyForm({ ...propertyForm, title: v })
                  }
                  placeholder="เช่น SmartLiving Room A101"
                  required
                />
                <Field
                  label="ที่ตั้ง"
                  value={propertyForm.location}
                  onChange={(v) =>
                    setPropertyForm({ ...propertyForm, location: v })
                  }
                  placeholder="เช่น กรุงเทพฯ"
                  required
                />
                <Field
                  label="ค่าเช่าต่องวด (ETH)"
                  type="number"
                  step="any"
                  value={propertyForm.rent}
                  onChange={(v) =>
                    setPropertyForm({ ...propertyForm, rent: v })
                  }
                  required
                />
                <Field
                  label="เงินประกัน (ETH)"
                  type="number"
                  step="any"
                  value={propertyForm.deposit}
                  onChange={(v) =>
                    setPropertyForm({ ...propertyForm, deposit: v })
                  }
                  required
                />
                <button
                  disabled={busy || !wallet}
                  className="btn primary form-submit"
                >
                  {busy ? "กำลังดำเนินการ..." : "ลงทะเบียนห้องเช่า"}
                </button>
              </form>
            </section>
            <div className="cards">
              {properties.map((p) => (
                <article className="property-card" key={p.id}>
                  <div className="property-image">
                    <Building2 size={52} />
                    <span>PROPERTY #{p.id}</span>
                  </div>
                  <div className="property-body">
                    <h3>{p.title}</h3>
                    <p className="muted">{p.location || "ไม่ระบุที่ตั้ง"}</p>
                    <div className="price-row">
                      <div>
                        <small>ค่าเช่า</small>
                        <strong>{fmt(p.rent)} ETH</strong>
                      </div>
                      <div>
                        <small>เงินประกัน</small>
                        <strong>{fmt(p.deposit)} ETH</strong>
                      </div>
                    </div>
                    <p className="owner">
                      เจ้าของ: {short(p.owner)} {isOwner(p) && "· คุณ"}
                    </p>
                  </div>
                </article>
              ))}
            </div>
            {properties.length === 0 && <Empty />}
          </>
        )}
        {tab === "agreements" && (
          <>
            <section className="panel">
              <div className="panel-title">
                <h3>
                  <FileSignature size={19} /> สร้างสัญญาเช่า
                </h3>
              </div>
              <p className="muted">
                เจ้าของทรัพย์สินสร้างสัญญาและลงนามอัตโนมัติ
                ผู้เช่าต้องลงนามอีกครั้งด้วย Wallet ของตน
              </p>

              <form
                className="form-grid"
                onSubmit={(e) => {
                  e.preventDefault();

                  // แปลงวันที่และเวลาเป็น Unix Timestamp (วินาที)
                  const startTimestamp = Math.floor(
                    new Date(agreementForm.start).getTime() / 1000,
                  );

                  const endTimestamp = Math.floor(
                    new Date(agreementForm.end).getTime() / 1000,
                  );

                  // ตรวจสอบวันที่และเวลา
                  if (
                    !Number.isFinite(startTimestamp) ||
                    !Number.isFinite(endTimestamp)
                  ) {
                    alert("กรุณาเลือกวันที่และเวลาให้ถูกต้อง");
                    return;
                  }

                  if (endTimestamp <= startTimestamp) {
                    alert("วันและเวลาสิ้นสุดต้องมากกว่าวันเริ่มต้น");
                    return;
                  }

                  // แปลงเงื่อนไขสัญญาเป็น Hash
                  const hash = ethers.keccak256(
                    ethers.toUtf8Bytes(agreementForm.terms),
                  );

                  // ส่งข้อมูลไปยัง Smart Contract
                  transact((c) =>
                    c.createAgreement(
                      BigInt(agreementForm.propertyId),
                      agreementForm.tenant,
                      BigInt(startTimestamp),
                      BigInt(endTimestamp),
                      hash,
                    ),
                  );
                }}
              >
                <label>
                  เลือกทรัพย์สิน
                  <select
                    required
                    value={agreementForm.propertyId}
                    onChange={(e) =>
                      setAgreementForm({
                        ...agreementForm,
                        propertyId: e.target.value,
                      })
                    }
                  >
                    <option value="">เลือกห้องเช่า</option>
                    {properties.filter(isOwner).map((p) => (
                      <option key={p.id} value={p.id}>
                        #{p.id} {p.title}
                      </option>
                    ))}
                  </select>
                </label>
                <Field
                  label="Wallet ผู้เช่า (0x...)"
                  value={agreementForm.tenant}
                  onChange={(v) =>
                    setAgreementForm({ ...agreementForm, tenant: v })
                  }
                  required
                />
                <Field
                  label="วันและเวลาเริ่มต้นสัญญา"
                  type="datetime-local"
                  step="60"
                  value={agreementForm.start}
                  onChange={(v) =>
                    setAgreementForm({ ...agreementForm, start: v })
                  }
                  required
                />
                <Field
                  label="วันและเวลาสิ้นสุดสัญญา"
                  type="datetime-local"
                  step="60"
                  value={agreementForm.end}
                  onChange={(v) =>
                    setAgreementForm({ ...agreementForm, end: v })
                  }
                  required
                />
                <label className="wide">
                  เงื่อนไขสัญญา (บันทึกเป็น Hash บน Blockchain)
                  <textarea
                    required
                    rows="3"
                    value={agreementForm.terms}
                    onChange={(e) =>
                      setAgreementForm({
                        ...agreementForm,
                        terms: e.target.value,
                      })
                    }
                    placeholder="ระบุรายละเอียดและเงื่อนไขการหักเงินประกัน..."
                  />
                </label>
                <p className="muted wide">
                  โปรดเก็บข้อความสัญญาฉบับเต็มไว้แยกต่างหาก ระบบบันทึกเฉพาะ Hash
                  เพื่อยืนยันความถูกต้อง
                </p>
                <button
                  className="btn primary form-submit"
                  disabled={busy || !wallet}
                >
                  สร้างสัญญาเช่า
                </button>
              </form>
            </section>
            <section className="panel">
              <div className="panel-title">
                <h3>สัญญาทั้งหมด</h3>
              </div>
              <AgreementTable agreements={agreements} properties={properties} />
            </section>
          </>
        )}
        {tab === "actions" && (
          <>
            <section className="panel">
              <div className="panel-title">
                <h3>
                  <Scale size={20} /> ดำเนินการตามสถานะสัญญา
                </h3>
              </div>
              <label>
                เลือกสัญญา
                <select
                  value={action.id}
                  onChange={(e) => setAction({ ...action, id: e.target.value })}
                >
                  <option value="">เลือกสัญญา</option>
                  {agreements.map((a) => (
                    <option key={a.id} value={a.id}>
                      สัญญา #{a.id} · {statuses[a.status]}
                    </option>
                  ))}
                </select>
              </label>
              {selected && (
                <div className="detail">
                  <div className="detail-top">
                    <h3>
                      สัญญา #{selected.id} · {selectedProperty?.title}
                    </h3>
                    <span className={"status s" + selected.status}>
                      {statuses[selected.status]}
                    </span>
                  </div>
                  <div className="detail-grid">
                    <Info label="ผู้เช่า" value={short(selected.tenant)} />
                    <Info
                      label="เจ้าของ"
                      value={short(selectedProperty?.owner)}
                    />
                    <Info
                      label="ระยะเวลา"
                      value={`${when(selected.start)} – ${when(selected.end)}`}
                    />
                    <Info
                      label="เงินประกันคงเหลือ"
                      value={`${fmt(selected.held)} ETH`}
                    />
                    <Info
                      label="เจ้าของยืนยัน"
                      value={
                        selected.ownerSigned ? "✓ ยืนยันแล้ว" : "ยังไม่ยืนยัน"
                      }
                    />
                    <Info
                      label="ผู้เช่ายืนยัน"
                      value={
                        selected.tenantSigned ? "✓ ยืนยันแล้ว" : "รอยืนยัน"
                      }
                    />
                    <Info
                      label="ตรวจสภาพห้อง"
                      value={
                        selected.approved ? "✓ อนุมัติแล้ว" : "ยังไม่อนุมัติ"
                      }
                    />
                    <Info
                      label="ค่าเช่าที่ชำระ"
                      value={`${selected.paidPeriods} งวด`}
                    />
                  </div>
                  <div className="hash">
                    Terms Hash: {selected.termsHash}{" "}
                    <button
                      title="คัดลอก"
                      onClick={() =>
                        navigator.clipboard.writeText(selected.termsHash)
                      }
                    >
                      <Copy size={15} />
                    </button>
                  </div>
                  {selected.resolution.reason && (
                    <p className="reason">
                      ผลการพิจารณา: {selected.resolution.reason} · หัก{" "}
                      {fmt(selected.resolution.deduction)} ETH
                    </p>
                  )}
                  <div className="actions">
                    {selected.status === 0 &&
                      isTenant(selected) &&
                      !selected.tenantSigned && (
                        <button
                          className="btn primary"
                          disabled={busy}
                          onClick={() =>
                            transact((c) => c.signAgreement(selected.id))
                          }
                        >
                          ยืนยันสัญญาด้วย Wallet
                        </button>
                      )}
                    {selected.status === 0 &&
                      isTenant(selected) &&
                      selected.tenantSigned &&
                      !selected.funded && (
                        <button
                          className="btn primary"
                          disabled={busy}
                          onClick={() =>
                            transact((c) =>
                              c.fundDeposit(selected.id, {
                                value: selectedProperty.deposit,
                              }),
                            )
                          }
                        >
                          ฝากเงินประกัน {fmt(selectedProperty.deposit)} ETH
                        </button>
                      )}
                    {selected.status === 1 && isTenant(selected) && (
                      <button
                        className="btn primary"
                        disabled={busy}
                        onClick={() =>
                          transact((c) =>
                            c.payRent(selected.id, {
                              value: selectedProperty.rent,
                            }),
                          )
                        }
                      >
                        ชำระค่าเช่า {fmt(selectedProperty.rent)} ETH
                      </button>
                    )}
                    {selected.status === 1 &&
                      Math.floor(Date.now() / 1000) >= selected.end &&
                      (isTenant(selected) || isOwner(selectedProperty)) && (
                        <button
                          className="btn outline"
                          disabled={busy}
                          onClick={() =>
                            transact((c) => c.requestInspection(selected.id))
                          }
                        >
                          เริ่มตรวจสภาพห้อง
                        </button>
                      )}
                    {selected.status === 2 &&
                      isOwner(selectedProperty) &&
                      !selected.approved && (
                        <button
                          className="btn primary"
                          disabled={busy}
                          onClick={() =>
                            transact((c) => c.approveInspection(selected.id))
                          }
                        >
                          ยืนยันตรวจสภาพห้องผ่าน
                        </button>
                      )}
                    {selected.status === 2 &&
                      (isTenant(selected) || isOwner(selectedProperty)) && (
                        <button
                          className="btn danger"
                          disabled={busy || !action.reason.trim()}
                          onClick={() =>
                            transact((c) =>
                              c.openDispute(selected.id, action.reason),
                            )
                          }
                        >
                          เปิดข้อพิพาท
                        </button>
                      )}
                    {selected.status === 2 &&
                      isTenant(selected) &&
                      !selected.tenantApproved && (
                        <button
                          className="btn outline"
                          disabled={busy || !action.reason.trim()}
                          onClick={() =>
                            transact((c) =>
                              c.approveDeduction(
                                selected.id,
                                ethers.parseEther(action.deduction || "0"),
                                action.reason,
                              ),
                            )
                          }
                        >
                          ผู้เช่ายอมรับยอดหัก
                        </button>
                      )}
                    {selected.status === 3 &&
                      wallet.toLowerCase() === arbiter.toLowerCase() && (
                        <button
                          className="btn primary"
                          disabled={busy || !action.reason.trim()}
                          onClick={() =>
                            transact((c) =>
                              c.resolveDispute(
                                selected.id,
                                ethers.parseEther(action.deduction || "0"),
                                action.reason,
                              ),
                            )
                          }
                        >
                          ผู้ตัดสินอนุมัติผลข้อพิพาท
                        </button>
                      )}
                    {(selected.status === 2 || selected.status === 3) && (
                      <button
                        className="btn primary"
                        disabled={busy}
                        onClick={() =>
                          transact((c) => c.settleDeposit(selected.id))
                        }
                      >
                        คืน / จัดสรรเงินประกัน
                      </button>
                    )}
                  </div>
                  {[2, 3].includes(selected.status) && (
                    <div className="form-grid subform">
                      <Field
                        label="ยอดหักเงินประกัน (ETH)"
                        type="number"
                        step="any"
                        value={action.deduction}
                        onChange={(v) => setAction({ ...action, deduction: v })}
                      />
                      <Field
                        label="เหตุผล / หลักฐาน (URL หรือข้อความ)"
                        value={action.reason}
                        onChange={(v) => setAction({ ...action, reason: v })}
                      />
                    </div>
                  )}
                  <p className="muted hint">
                    ปุ่มดำเนินการจะทำงานได้เมื่อ Wallet และเงื่อนไขใน Smart
                    Contract ถูกต้องเท่านั้น
                  </p>
                </div>
              )}
            </section>
          </>
        )}
        {tab === "payments" && (
          <section className="panel">
            <div className="panel-title">
              <h3>
                <History size={20} /> ประวัติการชำระค่าเช่า
              </h3>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>สัญญา</th>
                    <th>ผู้ชำระ</th>
                    <th>ยอด (ETH)</th>
                    <th>วันเวลาบน Blockchain</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p, i) => (
                    <tr key={i}>
                      <td>#{p.id}</td>
                      <td>{short(p.payer)}</td>
                      <td>{fmt(p.amount)}</td>
                      <td>{new Date(p.time * 1000).toLocaleString("th-TH")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {payments.length === 0 && <Empty />}
            </div>
            <p className="muted hint">
              รายการนี้อ่านจากข้อมูลที่ Smart Contract บันทึกไว้
              ไม่ใช่ฐานข้อมูลภายนอก
            </p>
          </section>
        )}
        <footer>
          SmartLiving © 2026 · Powered by Solidity, MetaMask & Infura ·{" "}
          {ready ? short(ADDRESS) : "ยังไม่ได้ตั้งค่า Contract"}
        </footer>
      </main>
    </div>
  );
}
function Stat({ icon: Icon, label, value, unit }) {
  return (
    <div className="stat">
      <div className="stat-icon">
        <Icon size={23} />
      </div>
      <p>{label}</p>
      <strong>
        {value} <small>{unit}</small>
      </strong>
    </div>
  );
}
function Field({
  label,
  value,
  onChange,
  placeholder = "",
  type = "text",
  step,
  required = false,
}) {
  return (
    <label>
      {label}
      <input
        required={required}
        type={type}
        step={step}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
function Info({ label, value }) {
  return (
    <div>
      <small>{label}</small>
      <b>{value}</b>
    </div>
  );
}
function Empty() {
  return (
    <div className="empty">
      <Building2 size={36} />
      <p>ยังไม่มีข้อมูลบน Smart Contract</p>
    </div>
  );
}
function AgreementTable({ agreements, properties }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>เลขสัญญา</th>
            <th>อสังหาริมทรัพย์</th>
            <th>ผู้เช่า</th>
            <th>วันสิ้นสุด</th>
            <th>สถานะ</th>
          </tr>
        </thead>
        <tbody>
          {agreements.map((a) => (
            <tr key={a.id}>
              <td>
                <b>#{a.id}</b>
              </td>
              <td>
                {properties.find((p) => p.id === a.propertyId)?.title || "-"}
              </td>
              <td>{short(a.tenant)}</td>
              <td>{when(a.end)}</td>
              <td>
                <span className={"status s" + a.status}>
                  {statuses[a.status]}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {agreements.length === 0 && <Empty />}
    </div>
  );
}
export default App;
