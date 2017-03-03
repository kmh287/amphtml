/**
 * Copyright 2017 The AMP HTML Authors. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS-IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import '../../../amp-carousel/0.1/amp-carousel';
import {installBindForTesting} from '../bind-impl';
import {toggleExperiment} from '../../../../src/experiments';
import {createFixturefixture} from '../../../../testing/fixture';
import {bindForDoc} from '../../../../src/bind';
import {ampdocServiceFor} from '../../../../src/ampdoc';

describe.configure().retryOnSaucelabs().run('integration amp-bind', function() {
  let fixture;
  let ampdoc;
  let bind;
  const fixtureLocation = 'test/fixtures/amp-bind-integrations.html';

  this.timeout(5000);

  beforeEach(() => {
    return createFixturefixture(fixtureLocation).then(f => {
      fixture = f;
      toggleExperiment(fixture, 'amp-bind', true, true);
      return fixture.awaitEvent('amp:load:start', 1);
    }).then(() => {
      const ampdocService = ampdocServiceFor(fixture.win);
      ampdoc = ampdocService.getAmpDoc(fixture.doc);
      // Bind is installed manually here to get around an issue
      // toggling experiments on the fixture fixture.
      bind = installBindForTesting(ampdoc);
      return bind.initializePromiseForTesting();
    });
  });

  function waitForBindApplication() {
    // Bind should be available, but need to wait for actions to resolve
    // service promise for bind and call setState
    return bindForDoc(ampdoc).then(() => {
      return bind.setStatePromiseForTesting();
    });
  }

  function setButtonBinding(button, binding) {
    button.setAttribute('on', `tap:AMP.setState(${binding})`);
  }

  describe('text integration', () => {
    it('should update text when text attribute binding changes', () => {
      const textElement = fixture.doc.getElementById('textElement');
      const button = fixture.doc.getElementById('changeTextButton');
      expect(textElement.textContent).to.equal('unbound');
      button.click();
      return waitForBindApplication().then(() => {
        expect(textElement.textContent).to.equal('hello world');
      });
    });

    it('should update CSS class when class binding changes', () => {
      const textElement = fixture.doc.getElementById('textElement');
      const changeClassButton =
        fixture.doc.getElementById('changeTextClassButton');
      expect(textElement.className).to.equal('original');
      changeClassButton.click();
      return waitForBindApplication().then(() => {
        expect(textElement.className).to.equal('new');
      });
    });
  });

  describe('amp-carousel integration', () => {
    it('should update dependent bindings on carousel slide changes', () => {
      const slideNum = fixture.doc.getElementById('slideNum');
      const carousel = fixture.doc.getElementById('carousel');
      const impl = carousel.implementation_;
      expect(slideNum.textContent).to.equal('0');
      impl.go(1, /* animate */ false);
      return waitForBindApplication().then(() => {
        expect(slideNum.textContent).to.equal('1');
      });
    });

    it('should change slides when the slide attribute binding changes', () => {
      const carousel = fixture.doc.getElementById('carousel');
      const goToSlide1Button = fixture.doc.getElementById('goToSlide1Button');
      const impl = carousel.implementation_;
      // No previous slide as current slide is 0th side
      expect(impl.hasPrev()).to.be.false;
      goToSlide1Button.click();
      return waitForBindApplication().then(() => {
        // Has previous slide since the index has changed
        expect(impl.hasPrev()).to.be.true;
      });
    });
  });

  describe('amp-img integration', () => {
    it('should change src when the src attribute binding changes', () => {
      const changeImgSrcButton =
        fixture.doc.getElementById('changeImgSrcButton');
      const img = fixture.doc.getElementById('image');
      expect(img.getAttribute('src')).to.equal('https://lh3.googleusercontent' +
        '.com/5rcQ32ml8E5ONp9f9-Rf78IofLb9QjS5_0mqsY1zEFc=w300-h200-no');
      changeImgSrcButton.click();
      return waitForBindApplication().then(() => {
        expect(img.getAttribute('src')).to.equal('https://lh3' +
          '.googleusercontent.com/pSECrJ82R7-AqeBCOEPGPM9iG9O' +
          'EIQ_QXcbubWIOdkY=w400-h300-no');
      });
    });

    it('should NOT change src when new value is a blocked URL', () => {
      const changeImgSrcButton =
        fixture.doc.getElementById('changeImgSrcButton');
      const img = fixture.doc.getElementById('image');
      const originalSrc = 'https://lh3.googleusercontent.com/' +
        '5rcQ32ml8E5ONp9f9-Rf78IofLb9QjS5_0mqsY1zEFc=w300-h200-no';
      expect(img.getAttribute('src')).to.equal(originalSrc);
      const newSrc = '__amp_source_origin';
      const blockedURLBinding = `imageSrc="${newSrc}"`;
      setButtonBinding(changeImgSrcButton, blockedURLBinding);
      changeImgSrcButton.click();
      return waitForBindApplication().then(() => {
        expect(img.getAttribute('src')).to.equal(originalSrc);
      });
    });

    it('should NOT change src when new value uses an invalid protocol', () => {
      const changeImgSrcButton =
        fixture.doc.getElementById('changeImgSrcButton');
      const img = fixture.doc.getElementById('image');
      const originalSrc = 'https://lh3.googleusercontent.com/' +
        '5rcQ32ml8E5ONp9f9-Rf78IofLb9QjS5_0mqsY1zEFc=w300-h200-no';
      expect(img.getAttribute('src')).to.equal(originalSrc);
      const ftpSrc = 'ftp://foo:bar@192.168.1.1/lol.jpg';
      const ftpBinding = `imageSrc="${ftpSrc}"`;
      setButtonBinding(changeImgSrcButton, ftpBinding);
      changeImgSrcButton.click();
      return waitForBindApplication().then(() => {
        expect(img.getAttribute('src')).to.equal(originalSrc);
        const telSrc = 'tel:1-555-867-5309';
        const telBinding = `imageSrc="${telSrc}"`;
        setButtonBinding(changeImgSrcButton, telBinding);
        changeImgSrcButton.click();
        return waitForBindApplication();
      }).then(() => {
        expect(img.getAttribute('src')).to.equal(originalSrc);
      });
    });

    it('should change alt when the alt attribute binding changes', () => {
      const changeImgAltButton =
        fixture.doc.getElementById('changeImgAltButton');
      const img = fixture.doc.getElementById('image');
      expect(img.getAttribute('alt')).to.equal('unbound');
      changeImgAltButton.click();
      return waitForBindApplication().then(() => {
        expect(img.getAttribute('alt')).to.equal('hello world');
      });
    });

    it('should change width and height when their bindings change', () => {
      const changeImgDimensButton =
        fixture.doc.getElementById('changeImgDimensButton');
      const img = fixture.doc.getElementById('image');
      expect(img.getAttribute('height')).to.equal('200');
      expect(img.getAttribute('width')).to.equal('200');
      changeImgDimensButton.click();
      return waitForBindApplication().then(() => {
        expect(img.getAttribute('height')).to.equal('300');
        expect(img.getAttribute('width')).to.equal('300');
      });
    });
  });

  describe('amp-selector integration', () => {
    it('should update dependent bindings when selection changes', () => {
      const selectionText = fixture.doc.getElementById('selectionText');
      const img1 = fixture.doc.getElementById('selectorImg1');
      const img2 = fixture.doc.getElementById('selectorImg2');
      const img3 = fixture.doc.getElementById('selectorImg3');
      expect(img1.hasAttribute('selected')).to.be.false;
      expect(img2.hasAttribute('selected')).to.be.false;
      expect(img3.hasAttribute('selected')).to.be.false;
      expect(selectionText.textContent).to.equal('None');
      img2.click();
      return waitForBindApplication().then(() => {
        expect(img1.hasAttribute('selected')).to.be.false;
        expect(img2.hasAttribute('selected')).to.be.true;
        expect(img3.hasAttribute('selected')).to.be.false;
        expect(selectionText.textContent).to.equal('2');
      });
    });

    it('should update selection when bound value for selected changes', () => {
      const changeSelectionButton =
        fixture.doc.getElementById('changeSelectionButton');
      const selectionText = fixture.doc.getElementById('selectionText');
      const img1 = fixture.doc.getElementById('selectorImg1');
      const img2 = fixture.doc.getElementById('selectorImg2');
      const img3 = fixture.doc.getElementById('selectorImg3');
      expect(img1.hasAttribute('selected')).to.be.false;
      expect(img2.hasAttribute('selected')).to.be.false;
      expect(img3.hasAttribute('selected')).to.be.false;
      expect(selectionText.textContent).to.equal('None');
      // Changes selection to 2
      changeSelectionButton.click();
      return waitForBindApplication().then(() => {
        expect(img1.hasAttribute('selected')).to.be.false;
        expect(img2.hasAttribute('selected')).to.be.true;
        expect(img3.hasAttribute('selected')).to.be.false;
        expect(selectionText.textContent).to.equal('2');
      });
    });
  });

});
