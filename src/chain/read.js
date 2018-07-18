///////////////////////////////////////////
//// Read chain state & get event logs ////
///////////////////////////////////////////

import last from 'ramda/src/last';
import nth from 'ramda/src/nth';
import uniq from 'ramda/src/uniq';
import memoizeWith from 'ramda/src/memoizeWith';
import identity from 'ramda/src/identity';

import {
  getMethodSig,
  getChief,
  getProxyFactory,
  getNetworkName,
  web3Instance,
  getMkrAddress
} from './web3';
import {
  generateCallData,
  removeHexPrefix,
  weiToEther,
  paddedBytes32ToAddress,
  isZeroAddress
} from '../utils/ethereum';
import chiefInfo from './chief-info.json';

/**
 * @async @desc get address approval count
 * @param  {String} address
 * @return {String} number of approvals
 */
export const getApprovalCount = async address => {
  const chief = await getChief();
  const methodSig = getMethodSig('approvals(address)');
  const callData = generateCallData({
    method: methodSig,
    args: [removeHexPrefix(address)]
  });
  const approvalsHex = await web3Instance.eth.call({
    to: chief,
    data: callData
  });
  const approvals = weiToEther(approvalsHex);
  return approvals;
};

/**
 * @async @desc get address's current voted slate
 * @param  {String} address
 * @return {String} slateHex
 */
export const getVotedSlate = async address => {
  const chief = await getChief();
  const methodSig = getMethodSig('votes(address)');
  const callData = generateCallData({
    method: methodSig,
    args: [removeHexPrefix(address)]
  });
  const slateHex = await web3Instance.eth.call({
    to: chief,
    data: callData
  });
  return slateHex;
};

/**
 * @async @desc get address's deposited GOV
 * @param  {String} address
 * @return {String}
 */
export const getNumDeposits = async address => {
  const chief = await getChief();
  const methodSig = getMethodSig('deposits(address)');
  const callData = generateCallData({
    method: methodSig,
    args: [removeHexPrefix(address)]
  });
  const depositsHexWei = await web3Instance.eth.call({
    to: chief,
    data: callData
  });
  const deposits = weiToEther(depositsHexWei);
  return deposits;
};

/**
 * @async @desc get slate's addresses
 * @param  {String} slateHex
 * @return {String[]} addresses
 */
export const getSlateAddresses = async slateHex => {
  const chief = await getChief();
  const methodSig = getMethodSig('slates(bytes32,uint256)');
  /**
   * @async @param  {Number} [i] index
   * @param  {String[]} [arr] array
   * @return {String[]} addresses
   */
  const traverseSlate = async (i = 0, arr = []) => {
    // solidity's auto-gen'd getter for the (bytes32=>address[]) mapping requires the index
    // of the address array as a second arg, so we have to step through addresses until we've
    // found them all (╯°□°）╯︵ ┻━┻)
    const callData = generateCallData({
      method: methodSig,
      args: [removeHexPrefix(slateHex), i.toString()]
    });
    const slateElement = await web3Instance.eth.call({
      to: chief,
      data: callData
    });
    if (slateElement === '0x') return arr;
    const slateAddress = paddedBytes32ToAddress(slateElement);
    return traverseSlate(i + 1, [...arr, slateAddress]);
  };
  const addresses = await traverseSlate();
  return addresses;
};

/**
 * @async @desc use event logs to get all etched slates
 * @return {String[]} slates
 */
export const getHat = async () => {
  const chief = await getChief();
  const methodSig = getMethodSig('hat()');
  const callData = generateCallData({
    method: methodSig,
    args: []
  });
  const hat = await web3Instance.eth.call({
    to: chief,
    data: callData
  });
  return hat;
};

/**
 * @async @desc use event logs to get all etched slates
 * @return {String[]} slates
 */
export const getEtchedSlates = async () => {
  const network = await getNetworkName();
  const chief = await getChief(network);
  const etches = await web3Instance.eth.getPastLogs({
    fromBlock: chiefInfo.inception_block[network],
    toBlock: 'latest',
    address: chief,
    topics: [chiefInfo.events.etch]
  });
  const slates = etches.map(logObj => last(logObj.topics));
  return slates;
};

/**
 * @async @desc get the address of associated vote proxy if this wallet were hot
 * @param {String} address
 * @return {String} address
 */
export const getProxyAddressHot = async address => {
  const factory = await getProxyFactory();
  const methodSig = getMethodSig('hotMap(address)');
  const callData = generateCallData({
    method: methodSig,
    args: [removeHexPrefix(address)]
  });
  const hotMapVal = await web3Instance.eth.call({
    to: factory,
    data: callData
  });
  const proxyAddress = paddedBytes32ToAddress(hotMapVal);
  return proxyAddress;
};

/**
 * @async @desc get the address of associated vote proxy if this wallet were cold
 * @param {String} address
 * @return {String} address
 */
export const getProxyAddressCold = async address => {
  const factory = await getProxyFactory();
  const methodSig = getMethodSig('coldMap(address)');
  const callData = generateCallData({
    method: methodSig,
    args: [removeHexPrefix(address)]
  });
  const coldMapVal = await web3Instance.eth.call({
    to: factory,
    data: callData
  });
  const proxyAddress = paddedBytes32ToAddress(coldMapVal);
  return proxyAddress;
};

/**
 * @async @desc get the address of associated vote proxy if this wallet were cold
 * @param {String} address
 * @return {Object} { type, address }
 */
export const getProxyStatus = async address => {
  const proxyAddressHot = await getProxyAddressHot(address);
  if (!isZeroAddress(proxyAddressHot)) {
    return { type: 'hot', address: proxyAddressHot, hasProxy: true };
  }
  const proxyAddressCold = await getProxyAddressCold(address);
  if (!isZeroAddress(proxyAddressCold)) {
    return { type: 'cold', address: proxyAddressCold, hasProxy: true };
  }
  return { type: '', address: '', hasProxy: false };
};

/**
 * @async @desc use event logs to get all addresses that've locked
 * @return {String[]} addresses
 */
export const getLockLogs = async () => {
  const network = await getNetworkName();
  const chief = await getChief(network);
  const locks = await web3Instance.eth.getPastLogs({
    fromBlock: chiefInfo.inception_block[network],
    toBlock: 'latest',
    address: chief,
    topics: [chiefInfo.events.lock]
  });
  const addresses = uniq(
    locks.map(logObj => nth(1, logObj.topics)).map(paddedBytes32ToAddress)
  );
  return addresses;
};

// helper for when we might call getSlateAddresses with the same slate several times
const memoizedGetSlateAddresses = memoizeWith(identity, getSlateAddresses);

/**
 * @async @desc get the voter approvals and address for each proposal
 * @return {Object}
 */
export const getVoteTally = async () => {
  const voters = await getLockLogs();
  // we could use web3's "batch" feature here, but it doesn't seem that it would be any faster
  // https://ethereum.stackexchange.com/questions/47918/how-to-make-batch-transaction-in-ethereum
  const withDeposits = await Promise.all(
    voters.map(voter =>
      getNumDeposits(voter).then(deposits => ({
        address: voter,
        deposits: parseFloat(deposits)
      }))
    )
  );

  const withSlates = await Promise.all(
    withDeposits.map(addressDeposit =>
      getVotedSlate(addressDeposit.address).then(slate => ({
        ...addressDeposit,
        slate
      }))
    )
  );

  const withVotes = await Promise.all(
    withSlates.map(withSlate =>
      memoizedGetSlateAddresses(withSlate.slate).then(addresses => ({
        ...withSlate,
        votes: addresses
      }))
    )
  );

  const voteTally = {};
  for (const voteObj of withVotes) {
    for (const vote of voteObj.votes) {
      if (voteTally[vote] === undefined) {
        voteTally[vote] = {
          approvals: voteObj.deposits,
          addresses: [{ address: voteObj.address, deposits: voteObj.deposits }]
        };
      } else {
        voteTally[vote].approvals += voteObj.deposits;
        voteTally[vote].addresses.push({
          address: voteObj.address,
          deposits: voteObj.deposits
        });
      }
    }
  }
  for (const [key, value] of Object.entries(voteTally)) {
    const sortedAddresses = value.addresses.sort(
      (a, b) => b.deposits - a.deposits
    );
    const approvals = voteTally[key].approvals;
    const withPercentages = sortedAddresses.map(shapedVoteObj => ({
      ...shapedVoteObj,
      percent: ((shapedVoteObj.deposits * 100) / approvals).toFixed(2)
    }));
    voteTally[key] = withPercentages;
  }
  return voteTally;
};

/**
 * @async @desc use event logs to get all etched slates
 * @return {String} balance
 */
export const getMkrBalance = async address => {
  const mkr = await getMkrAddress();
  const methodSig = getMethodSig('balanceOf(address)');
  const callData = generateCallData({
    method: methodSig,
    args: [removeHexPrefix(address)]
  });
  const hexBalance = await web3Instance.eth.call({
    to: mkr,
    data: callData
  });
  const balanceStdUnits = weiToEther(hexBalance);
  return balanceStdUnits;
};