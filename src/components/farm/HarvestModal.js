import PropTypes from 'prop-types'
import Web3 from 'web3'
import Farm from '../../build/Farm.json'
import React, { useState } from 'react'
import {
  Modal,
  Button,
  Form,
  Input,
  Select,
} from 'semantic-ui-react'
import { connect } from 'react-redux'
import { store } from '../../store'
import { confirmedTx, openSeason } from '../../actions'
import Validator from 'validator'
import { ConfirmingTx } from '../notifications'
import { initContract } from '../../utils'
import api from '../../api'
import { useParams } from 'react-router-dom'

const options = [
  { key: 'kg', text: 'kilogram', value: 'kg' },
  { key: 'g', text: 'gram', value: 'g' },
  { key: 't', text: 'tonne', value: 'tonne' }
]

function HarvestModal({loaded, wallet, netId, farm, openHarvestModal, setOpenHarvestModal, conversionRate }) {

  const { tokenId } = useParams()

  const [supply, setSupply] = useState(0)
  const [price, setPrice] = useState(0)
  const [unit, setUnit] = useState("")
  const [error, setError] = useState({})
  const [buttonDisabled, setButtonDisabled] = useState(false)
  const [confirmingTransaction, setConfirmingTransaction] = useState(false)

  function validate(supply, price, unit) {
    const errors = {}
    if (supply <= 0) errors.supply = 'Supply cannot be 0'
    if (price <= 0) errors.price = 'Price cannot be 0'
    if (Validator.isEmpty(unit)) errors.unit = 'Invalid unit'
    return errors
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const error = validate(supply, price, unit)
    setError(error)
    if (Object.keys(error).length === 0) {
      const priceToWei = Web3.utils.toWei(price, 'ether')
      try {
        setButtonDisabled(true)
        const txStatus = {}
        const farmContract = initContract(Farm, netId)
        await farmContract.methods.createHarvest(supply, priceToWei, unit, tokenId).send({from: wallet.address[0]})
          .on('transactionHash', () => {
            setConfirmingTransaction(true)
          })
          .on('confirmation', async(confirmationNumber, receipt) => {
            if (confirmationNumber === 1) {
              setConfirmingTransaction(false)
              const { _supply, _price, _supplyUnit, _tokenId } = receipt.events.Harvesting.returnValues
              const updatedFarm = {}
              updatedFarm.season = await farmContract.methods.getTokenSeason(_tokenId).call()
              const _currentSeason = await farmContract.methods.currentSeason(_tokenId).call()
              setButtonDisabled(false)
              setConfirmingTransaction(false)
              txStatus.confirmed = true
              store.dispatch(confirmedTx({ ...txStatus }))
              store.dispatch(openSeason({ ...updatedFarm }))
              await api.farm.updateSeason(_tokenId, updatedFarm.season)
              await api.farm.updateHarvests(_currentSeason, _tokenId, _supply, _supplyUnit, _price)
            }
          })
          .on('error', error => console.log(error))
      } catch(error) {
        console.log(error)
      }
    }
  }

  return (
    <Modal
      size='tiny'
      open={farm.season === 'Crop Growth' && openHarvestModal}
    >
      <Modal.Header>
        Harvesting
        {confirmingTransaction && <ConfirmingTx />}
      </Modal.Header>
      <Modal.Content>
        <Form
          onSubmit={loaded ? handleSubmit : null}
        >
          <Form.Field
            id='form-control-input-supply'
            control={Input}
            label='Total harvest supply?'
            type='number'
            value={supply}
            onChange={(e, { value }) => setSupply(value)}
            error={error.supply ? { content: `${error.supply}`, pointing: 'above' } : false}
          />
          <Form.Field
            id='form-control-select-supply-unit'
            control={Select}
            label='Supply unit?'
            placeholder='kg/g/tonnes'
            options={options}
            value={unit}
            onChange={(e, { value }) => setUnit(value)}
            error={error.unit ? { content: `${error.unit}`, pointing: 'above' } : false}
          />
          <Form.Group inline>
          <Form.Field
            id='form-control-input-price'
            control={Input}
            label='What is your price per supply(Ether)?'
            placeholder="0.0053"
            type='number'
            value={price}
            onChange={(e, { value }) => setPrice(value)}
            error={error.price ? { content: `${error.price}`, pointing: 'above' } : false}
          />
            <Form.Field>
              <label>KES</label>
              <span>{parseInt(price * parseFloat(conversionRate.ethkes), 10)}</span>
            </Form.Field>
          </Form.Group>
          <Form.Button disabled={buttonDisabled} loading={buttonDisabled} control={Button} type='submit' color='violet' content='Confirm Harvest' />
        </Form>
      </Modal.Content>
      <Modal.Actions>
        <Button
          color='red'
          onClick={() => setOpenHarvestModal(false)}
        >
          Close
        </Button>
      </Modal.Actions>
    </Modal>
  )
}

HarvestModal.propTypes = {
  farm: PropTypes.object.isRequired,
  loaded: PropTypes.bool.isRequired,
  loading: PropTypes.bool.isRequired,
  wallet: PropTypes.object.isRequired,
  openHarvestModal: PropTypes.bool.isRequired,
  setOpenHarvestModal: PropTypes.func.isRequired,
  conversionRate: PropTypes.object.isRequired,
  netId: PropTypes.number.isRequired,
}

function mapStateToProps(state) {
  return {
    farm: state.farm,
    loaded: state.wallet.loaded,
    loading: state.loading.status,
    wallet: state.wallet,
    conversionRate: state.prices,
    netId: state.network.netId,
  }
}

export default connect(mapStateToProps)(HarvestModal)

