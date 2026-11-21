// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract SmartRental {
    enum Status { Created, Active, Inspection, Disputed, Closed }
    struct Property { address owner; string title; string location; uint256 rent; uint256 deposit; bool exists; }
    struct Agreement { uint256 propertyId; address tenant; uint64 start; uint64 end; bytes32 termsHash; bool ownerSigned; bool tenantSigned; bool funded; Status status; uint256 depositHeld; uint256 paidPeriods; }
    struct Payment { uint256 agreementId; address payer; uint256 amount; uint256 timestamp; }
    struct Resolution { uint256 refund; uint256 deduction; string reason; address approver; }
    address public immutable arbiter;
    uint256 public propertyCount;
    uint256 public agreementCount;
    mapping(uint256 => Property) public properties;
    mapping(uint256 => Agreement) public agreements;
    mapping(uint256 => Payment[]) private payments;
    mapping(uint256 => Resolution) public resolutions;
    mapping(uint256 => bool) public inspectionApproved;
    mapping(uint256 => bool) public tenantApprovedDeduction;
    uint256 private locked = 1;
    event PropertyRegistered(uint256 indexed id, address indexed owner);
    event AgreementCreated(uint256 indexed id, uint256 indexed propertyId, address indexed tenant);
    event AgreementSigned(uint256 indexed id, address indexed signer);
    event DepositFunded(uint256 indexed id, uint256 amount);
    event RentPaid(uint256 indexed id, address indexed tenant, uint256 amount, uint256 period);
    event InspectionApproved(uint256 indexed id);
    event DisputeOpened(uint256 indexed id, string reason);
    event DisputeResolved(uint256 indexed id, uint256 refund, uint256 deduction, string reason);
    event DepositSettled(uint256 indexed id, uint256 refund, uint256 deduction);
    modifier nonReentrant() { require(locked == 1, "Reentrant"); locked = 2; _; locked = 1; }
    modifier valid(uint256 id) { require(id > 0 && id <= agreementCount, "Agreement not found"); _; }
    constructor(address _arbiter) { require(_arbiter != address(0), "Invalid arbiter"); arbiter = _arbiter; }
    function registerProperty(string calldata title, string calldata location, uint256 rent, uint256 deposit) external returns (uint256 id) {
        require(bytes(title).length > 0 && rent > 0 && deposit > 0, "Invalid property");
        id = ++propertyCount; properties[id] = Property(msg.sender, title, location, rent, deposit, true);
        emit PropertyRegistered(id, msg.sender);
    }
    function createAgreement(uint256 propertyId, address tenant, uint64 start, uint64 end, bytes32 termsHash) external returns (uint256 id) {
        Property storage p = properties[propertyId];
        require(p.exists && p.owner == msg.sender, "Not property owner");
        require(tenant != address(0) && tenant != msg.sender && end > start && end > block.timestamp && termsHash != bytes32(0), "Invalid agreement");
        id = ++agreementCount;
        Agreement storage a = agreements[id];
        a.propertyId = propertyId; a.tenant = tenant; a.start = start; a.end = end; a.termsHash = termsHash; a.ownerSigned = true; a.status = Status.Created;
        emit AgreementCreated(id, propertyId, tenant); emit AgreementSigned(id, msg.sender);
    }
    function signAgreement(uint256 id) external valid(id) {
        Agreement storage a = agreements[id];
        require(a.status == Status.Created && msg.sender == a.tenant && !a.tenantSigned, "Cannot sign");
        a.tenantSigned = true; emit AgreementSigned(id, msg.sender);
    }
    function fundDeposit(uint256 id) external payable valid(id) {
        Agreement storage a = agreements[id]; Property storage p = properties[a.propertyId];
        require(msg.sender == a.tenant && a.ownerSigned && a.tenantSigned && !a.funded && a.status == Status.Created, "Not ready");
        require(msg.value == p.deposit, "Exact deposit required");
        a.funded = true; a.depositHeld = msg.value; a.status = Status.Active;
        emit DepositFunded(id, msg.value);
    }
    function payRent(uint256 id) external payable valid(id) {
        Agreement storage a = agreements[id]; Property storage p = properties[a.propertyId];
        require(msg.sender == a.tenant && a.status == Status.Active && block.timestamp <= a.end, "Rent unavailable");
        require(msg.value == p.rent, "Exact rent required");
        a.paidPeriods++;
        payments[id].push(Payment(id, msg.sender, msg.value, block.timestamp));
        (bool ok,) = payable(p.owner).call{value: msg.value}(""); require(ok, "Rent transfer failed");
        emit RentPaid(id, msg.sender, msg.value, a.paidPeriods);
    }
    function paymentCount(uint256 id) external view returns (uint256) { return payments[id].length; }
    function getPayment(uint256 id, uint256 index) external view returns (Payment memory) { return payments[id][index]; }
    function requestInspection(uint256 id) external valid(id) {
        Agreement storage a = agreements[id];
        require(msg.sender == a.tenant || msg.sender == properties[a.propertyId].owner, "Not party");
        require(a.status == Status.Active && block.timestamp >= a.end, "Not ended");
        a.status = Status.Inspection;
    }
    function approveInspection(uint256 id) external valid(id) {
        Agreement storage a = agreements[id];
        require(msg.sender == properties[a.propertyId].owner && a.status == Status.Inspection, "Not owner/inspection");
        inspectionApproved[id] = true; emit InspectionApproved(id);
    }
    function approveDeduction(uint256 id, uint256 deduction, string calldata reason) external valid(id) {
        Agreement storage a = agreements[id];
        require(msg.sender == a.tenant && a.status == Status.Inspection && deduction <= a.depositHeld && bytes(reason).length > 0, "Invalid deduction");
        tenantApprovedDeduction[id] = true;
        resolutions[id] = Resolution(a.depositHeld - deduction, deduction, reason, msg.sender);
    }
    function openDispute(uint256 id, string calldata reason) external valid(id) {
        Agreement storage a = agreements[id];
        require(msg.sender == a.tenant || msg.sender == properties[a.propertyId].owner, "Not party");
        require(a.status == Status.Inspection && bytes(reason).length > 0, "Invalid dispute");
        a.status = Status.Disputed; emit DisputeOpened(id, reason);
    }
    function resolveDispute(uint256 id, uint256 deduction, string calldata reason) external valid(id) {
        Agreement storage a = agreements[id];
        require(msg.sender == arbiter && a.status == Status.Disputed, "Only arbiter");
        require(deduction <= a.depositHeld && bytes(reason).length > 0, "Invalid resolution");
        resolutions[id] = Resolution(a.depositHeld - deduction, deduction, reason, msg.sender);
        emit DisputeResolved(id, a.depositHeld - deduction, deduction, reason);
    }
    function settleDeposit(uint256 id) external nonReentrant valid(id) {
        Agreement storage a = agreements[id];
        require(a.funded && a.depositHeld > 0, "No deposit");
        uint256 deduction;
        if (a.status == Status.Inspection) {
            require(inspectionApproved[id], "Inspection not approved");
            if (tenantApprovedDeduction[id]) deduction = resolutions[id].deduction;
        } else if (a.status == Status.Disputed) {
            require(resolutions[id].approver == arbiter, "Await arbiter");
            deduction = resolutions[id].deduction;
        } else revert("Invalid status");
        uint256 refund = a.depositHeld - deduction;
        a.depositHeld = 0; a.status = Status.Closed;
        if (refund > 0) { (bool ok,) = payable(a.tenant).call{value: refund}(""); require(ok, "Refund failed"); }
        if (deduction > 0) { (bool ok,) = payable(properties[a.propertyId].owner).call{value: deduction}(""); require(ok, "Deduction failed"); }
        emit DepositSettled(id, refund, deduction);
    }
}
