/* global io, Vue, web3, BigNumber */

var abiArrayChannel = [{'constant': true, 'inputs': [{'name': 's', 'type': 'string'}], 'name': 'stringToUint', 'outputs': [{'name': 'result', 'type': 'uint256'}], 'payable': false, 'type': 'function'}, {'constant': false, 'inputs': [], 'name': 'matchStake', 'outputs': [], 'payable': true, 'type': 'function'}, {'constant': false, 'inputs': [{'name': '_sender', 'type': 'address'}], 'name': 'initialDeposit', 'outputs': [], 'payable': true, 'type': 'function'}, {'constant': true, 'inputs': [], 'name': 'getBlanace', 'outputs': [{'name': '', 'type': 'uint256'}], 'payable': false, 'type': 'function'}, {'constant': false, 'inputs': [{'name': 'm', 'type': 'string'}, {'name': 'h', 'type': 'bytes32'}, {'name': 'v', 'type': 'uint8'}, {'name': 'r', 'type': 'bytes32'}, {'name': 's', 'type': 'bytes32'}], 'name': 'close', 'outputs': [], 'payable': false, 'type': 'function'}, {'constant': true, 'inputs': [{'name': 'message', 'type': 'string'}], 'name': 'decodeMessage', 'outputs': [{'name': '_nonce', 'type': 'uint256'}, {'name': '_player1balance', 'type': 'uint256'}, {'name': '_player2balance', 'type': 'uint256'}], 'payable': false, 'type': 'function'}, {'constant': true, 'inputs': [{'name': 'm', 'type': 'string'}, {'name': 'h', 'type': 'bytes32'}, {'name': 'v', 'type': 'uint8'}, {'name': 'r', 'type': 'bytes32'}, {'name': 's', 'type': 'bytes32'}], 'name': 'validateMessage', 'outputs': [{'name': '', 'type': 'bool'}], 'payable': false, 'type': 'function'}, {'constant': true, 'inputs': [{'name': 'hash', 'type': 'bytes32'}, {'name': 'v', 'type': 'uint8'}, {'name': 'r', 'type': 'bytes32'}, {'name': 's', 'type': 'bytes32'}], 'name': 'verify', 'outputs': [{'name': 'retAddr', 'type': 'address'}], 'payable': false, 'type': 'function'}, {'inputs': [{'name': '_owner', 'type': 'address'}, {'name': '_partner', 'type': 'address'}], 'payable': false, 'type': 'constructor'}, {'payable': false, 'type': 'fallback'}, {'anonymous': false, 'inputs': [{'indexed': false, 'name': '', 'type': 'uint256'}, {'indexed': false, 'name': '', 'type': 'uint256'}, {'indexed': false, 'name': '', 'type': 'uint256'}], 'name': 'ChannelClosed', 'type': 'event'}]
var abiArrayFactory = [{'constant': false, 'inputs': [{'name': 'partner', 'type': 'address'}], 'name': 'createChannel', 'outputs': [], 'payable': true, 'type': 'function'}, {'inputs': [], 'payable': false, 'type': 'constructor'}, {'anonymous': false, 'inputs': [{'indexed': true, 'name': 'from', 'type': 'address'}, {'indexed': true, 'name': 'to', 'type': 'address'}, {'indexed': true, 'name': 'contractAddress', 'type': 'address'}, {'indexed': false, 'name': 'value', 'type': 'uint256'}], 'name': 'ChannelCreated', 'type': 'event'}]
var factoryAddress = '0x290e293b176a6fdff81ab0f1d46bf569311f70a1'
var channelFactory = web3.eth.contract(abiArrayFactory).at(factoryAddress)
var channel

// Use whisper when ready
var socket = io('https://dopplr-socket-server.herokuapp.com')
var toWei = new BigNumber('1000000000000000000')

var wrapDataUri = function (text) {
  return 'data:text/plain,' + text
}

var app = new Vue({
  data: {
    watching: true,
    initFrom: null,
    initTo: null,
    initAmount: 0,
    nonce: 0,
    sendAmount: 0,
    myAddress: null,
    otherPersonAddress: null,
    contractAddress: null,
    history: {
      sent: [],
      received: []
    },
    myBalance: 0,
    otherBalance: 0,
    txData: null,
    channelClosed: false,
    closeTransactionHash: null
  },
  methods: {
    initStart: function () {
      var ref = this
      channelFactory.createChannel(ref.initTo, {
        from: ref.myAddress,
        value: web3.toWei(ref.initAmount),
        gas: 4000000
      }, function (err, result) {
        if (err) {
          console.error(err)
          ref.txData = err.toString()

          return
        }

        ref.txData = result
      })
    },
    send: function () {
      var ref = this

      var nonce = new BigNumber(ref.nonce)
      var amount = new BigNumber(ref.sendAmount).times(toWei)
      var myBalance = new BigNumber(ref.myBalance).times(toWei)
      var otherBalance = new BigNumber(ref.otherBalance).times(toWei)

      var newMyBalance = myBalance.minus(amount)
      var newOtherBalance = otherBalance.plus(amount)

      var originalMessage = [ nonce, newMyBalance, newOtherBalance ]
      .map(function (data) { return data.toString() })
      .join('|')

      var originalMessageSha3 = web3.sha3(originalMessage)

      ref.sendAmount = 0

      web3.eth.sign(ref.myAddress, originalMessageSha3, function (err, data) {
        if (err) throw err

        var originalMessageSha3Signed = data

        socket.emit('transaction', {
          nonce: ref.nonce,
          amount: amount.toString(),
          originalMessage: originalMessage,
          originalMessageSha3: originalMessageSha3,
          originalMessageSha3Signed: originalMessageSha3Signed
        })

        app.history.sent.push({
          nonce: ref.nonce,
          amount: web3.fromWei(amount.toString()),
          originalMessage: originalMessage,
          originalMessageSha3: originalMessageSha3,
          originalMessageSha3Signed: originalMessageSha3Signed,
          originalMessageDataUri: wrapDataUri(originalMessage),
          signedMessageDataUri: wrapDataUri(originalMessageSha3Signed)
        })

        ref.myBalance = web3.fromWei(newMyBalance)
        ref.otherBalance = web3.fromWei(newOtherBalance)
        ref.nonce++
      })
    },
    settle: function () {
      var ref = this
      var refToLastMessage

      if (app.history.received.length === 0) {
        // sent
        refToLastMessage = ref.history.sent[ref.history.sent.length - 1]
      } else {
        // received
        refToLastMessage = ref.history.received[ref.history.received.length - 1]
      }

      var m = refToLastMessage.originalMessage
      var sig = refToLastMessage.originalMessageSha3Signed
      var h = refToLastMessage.originalMessageSha3

      if (h !== web3.sha3(m)) throw new Error('Kya be?')

      var r = sig.slice(0, 66)
      var s = '0x' + sig.slice(66, 130)
      var v = '0x' + sig.slice(130, 132)
      v = web3.toDecimal(v)

      if (v < 27) v += 27

      channel.close(m, h, v, r, s, function (err, res) {
        if (err) throw err

        app.closeTransactionHash = res
      })
    }
  }
})

app.$mount('#app')

socket.on('transaction', function (data) {
  if (data.channelClosed === true) {
    app.channelClosed = true
    app.closeTransactionHash = data.closeTransactionHash
  } else {
    app.history.received.push({
      nonce: data.nonce,
      amount: web3.fromWei(data.amount),
      originalMessage: data.originalMessage,
      originalMessageSha3: data.originalMessageSha3,
      originalMessageSha3Signed: data.originalMessageSha3Signed,
      originalMessageDataUri: wrapDataUri(data.originalMessage),
      signedMessageDataUri: wrapDataUri(data.originalMessageSha3Signed)
    })

    var myBalance = new BigNumber(app.myBalance).times(toWei)
    var otherBalance = new BigNumber(app.otherBalance).times(toWei)

    app.myBalance = web3.fromWei(myBalance.plus(data.amount))
    app.otherBalance = web3.fromWei(otherBalance.minus(data.amount))
    app.nonce = data.nonce + 1
  }
})

web3.eth.getAccounts(function (err, accounts) {
  if (err) throw err

  var myAddress = accounts[0]

  app.initFrom = myAddress
  app.myAddress = myAddress

  var event = channelFactory.ChannelCreated()
  event.watch(function (err, result) {
    if (err) throw err

    if (result.args.to === myAddress ||
        result.args.from === myAddress) {
      event.stopWatching(function () {
        app.watching = false
        app.contractAddress = result.args.contractAddress

        console.log('Contract deployed at ' + app.contractAddress)

        if (myAddress === result.args.to) {
          app.otherPersonAddress = result.args.from
          app.otherBalance = web3.fromWei(result.args.value.toString())
        } else {
          app.otherPersonAddress = result.args.to
          app.myBalance = web3.fromWei(result.args.value.toString())
        }

        channel = web3.eth.contract(abiArrayChannel).at(app.contractAddress)

        var closedEvent = channel.ChannelClosed()
        closedEvent.watch(function (err, rsult) {
          if (err) throw err

          closedEvent.stopWatching(function () {
            app.channelClosed = true

            if (app.closeTransactionHash) {
              socket.emit('transaction', {
                closeTransactionHash: app.closeTransactionHash,
                channelClosed: true
              })
            }
          })
        })

        socket.emit('join', result.args.contractAddress)
      })
    }
  })
})
